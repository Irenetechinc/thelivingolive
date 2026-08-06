/**
 * community.js — Olive Chat community API
 * Mounted at /api/community in index.js.
 * All endpoints require Supabase JWT (requireUser applied in index.js).
 * Operations that need service-role (resolving names, creating DM rooms, etc.)
 * use req.app.locals.supabaseAdmin.
 */

import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { Expo } from 'expo-server-sdk';
import { logger } from '../lib/logger.js';
import { notifyCommunity } from '../lib/pushHelper.js';
import { compressVideo } from '../lib/videoProcessor.js';

const log = logger('community');
const router = Router();
// Allowed MIME type sets for each upload context
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif',
  // Android content-provider fallbacks — React Native sometimes reports these
  // for valid images when the URI comes from a content:// provider.
  'application/octet-stream',
]);
const ALLOWED_MEDIA_TYPES = new Set([
  ...ALLOWED_IMAGE_TYPES,
  'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/ogg',
  'video/mp4', 'video/quicktime', 'video/webm',
]);
// Post uploads: images + all common mobile video MIME types
const ALLOWED_POST_TYPES  = new Set([
  ...ALLOWED_IMAGE_TYPES,
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
  // Additional Android MIME types for videos
  'video/mpeg', 'video/3gpp', 'video/3gpp2', 'video/x-matroska',
]);

function mimeFilter(allowed) {
  return (_req, file, cb) => {
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 400 }), false);
  };
}

/**
 * Wraps a multer middleware so errors are always returned as JSON.
 * Without this wrapper, multer errors propagate as HTML (the Express default),
 * which the mobile client cannot parse and turns into a generic "Upload failed".
 */
function withJsonError(multerMiddleware) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ error: 'File too large. Maximum size is 100 MB.' });
      if (err.message?.startsWith('File type not allowed'))
        return res.status(400).json({ error: 'Unsupported file type. Please upload a JPG, PNG, GIF, or video file.' });
      log.error('multer error:', err.message);
      return res.status(400).json({ error: 'Upload error. Please try again.' });
    });
  };
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: mimeFilter(ALLOWED_POST_TYPES) });

// ── Expo client (shared from app.locals or created locally) ──────────────────
function getExpo() {
  return new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
}

// ── PIN helpers ───────────────────────────────────────────────────────────────
function hashPin(pin, userId) {
  return crypto.pbkdf2Sync(String(pin), userId, 10_000, 32, 'sha256').toString('hex');
}

// ── User-name resolution ──────────────────────────────────────────────────────
async function resolveNames(supabase, userIds) {
  const map = {};
  await Promise.all([...new Set(userIds)].filter(Boolean).map(async (uid) => {
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(uid);
      const meta = user?.user_metadata ?? {};
      map[uid] = meta.full_name?.trim() || meta.name?.trim() || user?.email?.split('@')[0] || `user_${uid.slice(0, 6)}`;
    } catch {
      map[uid] = `user_${uid.slice(0, 6)}`;
    }
  }));
  return map;
}

async function resolveDisplayNames(supabase, userIds) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return {};
  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('id, display_name, avatar_url')
    .in('id', ids);
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));
  const authMap = await resolveNames(supabase, ids.filter(id => !profileMap[id]?.display_name));
  const result = {};
  for (const id of ids) {
    result[id] = {
      name: profileMap[id]?.display_name || authMap[id] || `user_${id.slice(0, 6)}`,
      avatarUrl: profileMap[id]?.avatar_url ?? null,
    };
  }
  return result;
}

// ── Profile ───────────────────────────────────────────────────────────────────

router.get('/profile', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const userId = req.user.id;
  let { data } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
  if (!data) {
    const authNames = await resolveNames(supabase, [userId]);
    const { data: created } = await supabase.from('user_profiles')
      .insert({ id: userId, display_name: authNames[userId] })
      .select().single();
    data = created;
  }
  const { chat_pin_hash: _, ...safe } = data ?? {};
  // Include own post count so profile tab can show it immediately without a second fetch
  const { count: postCount } = await supabase
    .from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  res.json({ ok: true, profile: { ...safe, email: req.user.email, postCount: postCount ?? 0 } });
});

router.get('/profile/:userId', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const me = req.user.id;
  const them = req.params.userId;
  const [profileRes, connRes, postCountRes] = await Promise.all([
    // Select only base guaranteed columns first — extended columns (church_affiliation etc.)
    // may not exist in production yet. We'll try extended fields separately.
    supabase.from('user_profiles')
      .select('id, display_name, bio, avatar_url, cover_url, date_of_birth')
      .eq('id', them).maybeSingle(),
    supabase.from('user_connections')
      .select('id, status, requester_id, addressee_id, created_at')
      .or(`and(requester_id.eq.${me},addressee_id.eq.${them}),and(requester_id.eq.${them},addressee_id.eq.${me})`)
      .maybeSingle(),
    supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('user_id', them),
    supabase.from('user_connections').select('id', { count: 'exact', head: true })
      .or(`requester_id.eq.${them},addressee_id.eq.${them}`).eq('status', 'accepted'),
  ]);
  if (!profileRes.data) return res.status(404).json({ error: 'Profile not found' });
  let p = profileRes.data;
  // Try to fetch extended profile fields (added via migration). If columns don't exist yet, skip gracefully.
  try {
    const { data: ext } = await supabase.from('user_profiles')
      .select('username, church_affiliation, location, state, country, education, gender, website, dob_public')
      .eq('id', them).maybeSingle();
    if (ext) p = { ...p, ...ext };
  } catch {}
  res.json({ ok: true, profile: { ...p, connectionStatus: connRes.data ?? null, postCount: postCountRes.count ?? 0 } });
});

router.put('/profile', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const {
    displayName, bio, dateOfBirth,
    username, churchAffiliation, location, state, country,
    education, gender, website, dobPublic,
  } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (displayName !== undefined) updates.display_name = String(displayName).slice(0, 60).trim() || null;
  if (bio !== undefined) updates.bio = String(bio).slice(0, 500).trim() || null;
  if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth || null;
  if (username !== undefined) updates.username = username ? String(username).replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 30) || null : null;
  if (churchAffiliation !== undefined) updates.church_affiliation = String(churchAffiliation).slice(0, 120).trim() || null;
  if (location !== undefined) updates.location = String(location).slice(0, 100).trim() || null;
  if (state !== undefined) updates.state = String(state).slice(0, 60).trim() || null;
  if (country !== undefined) updates.country = String(country).slice(0, 60).trim() || null;
  if (education !== undefined) updates.education = String(education).slice(0, 120).trim() || null;
  if (gender !== undefined) updates.gender = String(gender).slice(0, 40).trim() || null;
  if (website !== undefined) updates.website = String(website).slice(0, 200).trim() || null;
  if (dobPublic !== undefined) updates.dob_public = Boolean(dobPublic);
  let { error } = await supabase.from('user_profiles').upsert({ id: req.user.id, ...updates }, { onConflict: 'id' });

  // If a column doesn't exist yet (migration pending), fall back to core fields only.
  // Error code 42703 = undefined_column in PostgreSQL / Supabase.
  if (error && (error.code === '42703' || error.message?.includes('column') || error.message?.includes('schema cache'))) {
    log.warn('profile update: extended columns missing, falling back to base fields. Run fix_missing_columns.sql migration.');
    const baseUpdates = { updated_at: updates.updated_at };
    if (updates.display_name !== undefined) baseUpdates.display_name = updates.display_name;
    if (updates.bio !== undefined) baseUpdates.bio = updates.bio;
    if (updates.date_of_birth !== undefined) baseUpdates.date_of_birth = updates.date_of_birth;
    const fallback = await supabase.from('user_profiles').upsert({ id: req.user.id, ...baseUpdates }, { onConflict: 'id' });
    error = fallback.error;
  }

  if (error) { log.error('profile update error:', error.message); return res.status(500).json({ error: 'Could not update profile. Please try again.' }); }
  res.json({ ok: true });
});

router.post('/profile/set-pin', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { pin } = req.body;
  if (pin === null || pin === undefined || pin === '') {
    const { error } = await supabase.from('user_profiles')
      .upsert({ id: req.user.id, chat_pin_hash: null }, { onConflict: 'id' });
    if (error) { log.error('set-pin clear error:', error.message); return res.status(500).json({ error: 'Could not clear PIN. Please try again.' }); }
    return res.json({ ok: true, pinSet: false });
  }
  if (!/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be 4–8 digits' });
  const hash = hashPin(String(pin), req.user.id);
  const { error } = await supabase.from('user_profiles')
    .upsert({ id: req.user.id, chat_pin_hash: hash }, { onConflict: 'id' });
  if (error) { log.error('set-pin upsert error:', error.message); return res.status(500).json({ error: 'Could not save PIN. Please try again.' }); }
  res.json({ ok: true, pinSet: true });
});

router.post('/profile/validate-pin', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'pin is required' });
  const { data } = await supabase
    .from('user_profiles').select('chat_pin_hash').eq('id', req.user.id).maybeSingle();
  if (!data?.chat_pin_hash) return res.json({ ok: true, valid: true });
  const hash = hashPin(String(pin), req.user.id);
  res.json({ ok: true, valid: hash === data.chat_pin_hash });
});

router.get('/profile/pin-status', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data } = await supabase
    .from('user_profiles').select('chat_pin_hash').eq('id', req.user.id).maybeSingle();
  res.json({ ok: true, pinSet: !!data?.chat_pin_hash });
});

const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: mimeFilter(ALLOWED_IMAGE_TYPES) });
router.post('/profile/upload/:type', withJsonError(avatarUpload.single('file')), async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { type } = req.params;
  if (!['avatar', 'cover'].includes(type)) return res.status(400).json({ error: 'type must be avatar or cover' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  await ensureStorageBucket(supabase); // profile uploads use the same community bucket
  const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `profiles/${req.user.id}/${type}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('community')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (error) { log.error('db error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  const { data: { publicUrl } } = supabase.storage.from('community').getPublicUrl(path);
  const field = type === 'avatar' ? 'avatar_url' : 'cover_url';
  await supabase.from('user_profiles').upsert({ id: req.user.id, [field]: publicUrl }, { onConflict: 'id' });
  res.json({ ok: true, url: publicUrl });
});

// ── Church general room auto-join (internal helper, not an HTTP endpoint) ─────
// Derives the user's church from authoritative DB state — never from request body.
// Returns the roomId, or null if the user is not a church member.
export async function ensureUserInChurchGeneralRoom(supabase, userId) {
  // Authoritative church lookup — only the DB knows which church this user belongs to
  const { data: membership } = await supabase
    .from('church_members')
    .select('church_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership?.church_id) return null;
  const churchId = membership.church_id;

  // Find or create the church's General group room
  let { data: existing } = await supabase
    .from('chat_rooms')
    .select('id')
    .eq('church_id', churchId)
    .eq('type', 'group')
    .eq('name', 'General')
    .maybeSingle();

  let roomId;
  if (!existing) {
    const { data: created, error } = await supabase
      .from('chat_rooms')
      .insert({ type: 'group', name: 'General', church_id: churchId })
      .select('id')
      .single();
    if (error) { log.error('create-general-room error:', error.message); return null; }
    roomId = created.id;
  } else {
    roomId = existing.id;
  }

  // Add the user to the room (idempotent)
  await supabase
    .from('chat_room_members')
    .upsert({ room_id: roomId, user_id: userId }, { onConflict: 'room_id,user_id' });

  return roomId;
}

// ── Notifications ─────────────────────────────────────────────────────────────

// GET notifications for current user (latest 50, unread first)
router.get('/notifications', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('community_notifications')
    .select('*')
    .eq('recipient_id', req.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { log.error('notifications fetch error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  const actorIds = [...new Set((data ?? []).map(n => n.actor_id))];
  const nameMap = await resolveDisplayNames(supabase, actorIds);

  const result = (data ?? []).map(n => ({
    id: n.id,
    type: n.type,
    isRead: n.is_read,
    createdAt: n.created_at,
    postId: n.post_id,
    commentId: n.comment_id,
    roomId: n.room_id,
    actor: { userId: n.actor_id, ...nameMap[n.actor_id] },
  }));
  res.json({ ok: true, notifications: result });
});

// PUT mark notifications as read
router.put('/notifications/read', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { ids } = req.body; // optional array of ids; if omitted, mark all read
  let q = supabase
    .from('community_notifications')
    .update({ is_read: true })
    .eq('recipient_id', req.user.id);
  if (ids?.length) q = q.in('id', ids);
  await q;
  res.json({ ok: true });
});

// ── Church members list ────────────────────────────────────────────────────────
router.get('/members', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: membership } = await supabase
    .from('church_members').select('church_id').eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'You must belong to a church to use Olive Chat.' });

  const { data: members } = await supabase
    .from('church_members').select('user_id').eq('church_id', membership.church_id);
  const ids = (members ?? []).map(m => m.user_id).filter(id => id !== req.user.id);
  const nameMap = await resolveDisplayNames(supabase, ids);
  const result = ids.map(id => ({ userId: id, ...nameMap[id] }));
  res.json({ ok: true, members: result });
});

// ── Chat rooms ────────────────────────────────────────────────────────────────

router.get('/rooms', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: membership } = await supabase
    .from('church_members').select('church_id').eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Join a church to access Olive Chat.' });

  const { data: memberships } = await supabase
    .from('chat_room_members')
    .select('room_id, last_read_at')
    .eq('user_id', req.user.id);
  if (!memberships?.length) return res.json({ ok: true, rooms: [] });

  const roomIds = memberships.map(m => m.room_id);
  const readMap = Object.fromEntries(memberships.map(m => [m.room_id, m.last_read_at]));

  const { data: rooms } = await supabase
    .from('chat_rooms')
    .select('id, name, type, church_id')
    .in('id', roomIds);

  const lastMsgPromises = roomIds.map(rid =>
    supabase.from('chat_messages').select('body, type, media_url, created_at, user_id')
      .eq('room_id', rid).order('created_at', { ascending: false }).limit(1)
  );
  const lastMsgs = await Promise.allSettled(lastMsgPromises);

  const unreadPromises = roomIds.map((rid) =>
    readMap[rid]
      ? supabase.from('chat_messages').select('*', { count: 'exact', head: true })
          .eq('room_id', rid).gt('created_at', readMap[rid]).neq('user_id', req.user.id)
      : Promise.resolve({ count: 0 })
  );
  const unreadResults = await Promise.allSettled(unreadPromises);

  const dmRooms = (rooms ?? []).filter(r => r.type === 'dm');
  const allDmMemberRes = await Promise.allSettled(
    dmRooms.map(r => supabase.from('chat_room_members').select('user_id').eq('room_id', r.id).neq('user_id', req.user.id).limit(1))
  );
  const dmOtherIds = allDmMemberRes.map(r => r.status === 'fulfilled' ? r.value.data?.[0]?.user_id : null);
  const nameMap = await resolveDisplayNames(supabase, dmOtherIds.filter(Boolean));
  let dmIdx = 0;

  const result = (rooms ?? []).map((room, i) => {
    const last = lastMsgs[i].status === 'fulfilled' ? lastMsgs[i].value.data?.[0] : null;
    const unread = unreadResults[i].status === 'fulfilled' ? (unreadResults[i].value.count ?? 0) : 0;
    let otherUser = null;
    if (room.type === 'dm') {
      const otherId = dmOtherIds[dmIdx++];
      if (otherId) otherUser = { userId: otherId, ...nameMap[otherId] };
    }
    return {
      id: room.id, name: room.name, type: room.type, churchId: room.church_id,
      lastMessage: last ? {
        body: last.type === 'text' ? last.body : `[${last.type}]`,
        createdAt: last.created_at,
        senderId: last.user_id,
      } : null,
      unreadCount: unread,
      otherUser,
    };
  });

  result.sort((a, b) => {
    if (a.type === 'group' && b.type !== 'group') return -1;
    if (b.type === 'group' && a.type !== 'group') return 1;
    const aTime = a.lastMessage?.createdAt ?? '0';
    const bTime = b.lastMessage?.createdAt ?? '0';
    return bTime.localeCompare(aTime);
  });

  res.json({ ok: true, rooms: result });
});

router.post('/rooms/dm', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { targetUserId } = req.body;
  if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: 'Invalid target user' });

  // Check if target has blocked the sender
  const { data: block } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('user_id', targetUserId)
    .eq('blocked_user_id', req.user.id)
    .maybeSingle();
  if (block) return res.status(403).json({ error: 'Unable to send message to this user.' });

  const { data: myMembership } = await supabase
    .from('church_members').select('church_id').eq('user_id', req.user.id).maybeSingle();
  if (!myMembership) return res.status(403).json({ error: 'You must belong to a church.' });

  const { data: myRooms } = await supabase
    .from('chat_room_members').select('room_id').eq('user_id', req.user.id);
  const { data: theirRooms } = await supabase
    .from('chat_room_members').select('room_id').eq('user_id', targetUserId);
  const myIds = new Set((myRooms ?? []).map(r => r.room_id));
  const shared = (theirRooms ?? []).find(r => myIds.has(r.room_id));
  if (shared) {
    const { data: room } = await supabase.from('chat_rooms').select('id,name,type').eq('id', shared.room_id).eq('type', 'dm').maybeSingle();
    if (room) return res.json({ ok: true, roomId: room.id });
  }

  // Create the DM room
  const { data: room, error } = await supabase.from('chat_rooms')
    .insert({ type: 'dm', name: null }).select('id').single();
  if (error) { log.error('db error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  await supabase.from('chat_room_members').insert([
    { room_id: room.id, user_id: req.user.id },
    { room_id: room.id, user_id: targetUserId },
  ]);

  // Create a message request for the target so they can accept/reject before seeing messages
  await supabase.from('message_requests').insert({
    room_id: room.id,
    sender_id: req.user.id,
    receiver_id: targetUserId,
    status: 'pending',
  });

  res.json({ ok: true, roomId: room.id, requestPending: true });
});

router.get('/rooms/:roomId/messages', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { roomId } = req.params;
  const before = req.query.before;
  const limit = Math.min(parseInt(req.query.limit ?? '40', 10), 100);

  const { data: membership } = await supabase.from('chat_room_members')
    .select('room_id').eq('room_id', roomId).eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this room' });

  let q = supabase.from('chat_messages')
    .select('id, user_id, type, body, media_url, duration_seconds, shared_post_id, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);

  const { data: msgs, error } = await q;
  if (error) { log.error('db error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  // Enrich shared posts with a body preview
  const sharedPostIds = (msgs ?? []).filter(m => m.shared_post_id).map(m => m.shared_post_id);
  let sharedPostMap = {};
  if (sharedPostIds.length) {
    const { data: sharedPosts } = await supabase
      .from('community_posts')
      .select('id, body, image_url, video_thumbnail_url')
      .in('id', sharedPostIds);
    sharedPostMap = Object.fromEntries((sharedPosts ?? []).map(p => [p.id, p]));
  }

  const nameMap = await resolveDisplayNames(supabase, (msgs ?? []).map(m => m.user_id));
  const messages = (msgs ?? []).reverse().map(m => {
    const sp = m.shared_post_id ? sharedPostMap[m.shared_post_id] : null;
    return {
      ...m,
      sender: { userId: m.user_id, ...nameMap[m.user_id] },
      sharedPost: sp ? { id: sp.id, body: sp.body, thumbnailUrl: sp.video_thumbnail_url ?? sp.image_url } : null,
    };
  });
  res.json({ ok: true, messages });
});

router.post('/rooms/:roomId/messages', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const expo = getExpo();
  const { roomId } = req.params;
  const { type = 'text', body, mediaUrl, durationSeconds, sharedPostId } = req.body;

  if (!['text', 'image', 'voice', 'post_share'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (type === 'text' && !body?.trim()) return res.status(400).json({ error: 'body is required for text messages' });
  if ((type === 'image' || type === 'voice') && !mediaUrl) return res.status(400).json({ error: 'mediaUrl is required' });

  const { data: membership } = await supabase.from('chat_room_members')
    .select('room_id').eq('room_id', roomId).eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member' });

  const { data: msg, error } = await supabase.from('chat_messages').insert({
    room_id: roomId, user_id: req.user.id, type,
    body: body?.trim() ?? null, media_url: mediaUrl ?? null,
    duration_seconds: durationSeconds ?? null, shared_post_id: sharedPostId ?? null,
  }).select('id, user_id, type, body, media_url, duration_seconds, shared_post_id, created_at').single();
  if (error) { log.error('db error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
  const actorName = nameMap[req.user.id]?.name ?? 'Someone';

  // Push notifications to all OTHER members of this room
  const { data: roomInfo } = await supabase.from('chat_rooms').select('type, name').eq('id', roomId).maybeSingle();
  const { data: otherMembers } = await supabase
    .from('chat_room_members')
    .select('user_id')
    .eq('room_id', roomId)
    .neq('user_id', req.user.id);

  const msgPreview = type === 'text'
    ? (body?.slice(0, 60) ?? '')
    : type === 'voice' ? '🎙 Voice note'
    : type === 'image' ? '📷 Image'
    : '📤 Shared a post';

  const notifPromises = (otherMembers ?? []).map(m =>
    notifyCommunity(supabase, expo, {
      recipientId: m.user_id,
      actorId: req.user.id,
      actorName,
      type: 'dm_message',
      roomId,
      messageId: msg.id,
      pushTitle: roomInfo?.type === 'dm' ? actorName : `${actorName} in ${roomInfo?.name ?? 'General'}`,
      pushBody: msgPreview,
    })
  );
  Promise.allSettled(notifPromises).catch(() => {});

  res.json({ ok: true, message: { ...msg, sender: { userId: req.user.id, ...nameMap[req.user.id] }, sharedPost: null } });
});

router.put('/rooms/:roomId/read', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  await supabase.from('chat_room_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('room_id', req.params.roomId).eq('user_id', req.user.id);
  // Also mark related notifications as read
  await supabase.from('community_notifications')
    .update({ is_read: true })
    .eq('recipient_id', req.user.id)
    .eq('room_id', req.params.roomId);
  res.json({ ok: true });
});

const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: mimeFilter(ALLOWED_MEDIA_TYPES) });
router.post('/rooms/:roomId/upload', mediaUpload.single('file'), async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `messages/${req.params.roomId}/${req.user.id}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('community').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (error) { log.error('db error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  const { data: { publicUrl } } = supabase.storage.from('community').getPublicUrl(path);
  res.json({ ok: true, url: publicUrl });
});

// ── Timeline posts ─────────────────────────────────────────────────────────────

router.get('/timeline', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: membership } = await supabase
    .from('church_members').select('church_id').eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Join a church to access the community feed.' });

  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 50);
  const before = req.query.before;
  let q = supabase.from('community_posts')
    .select('id, user_id, body, image_url, video_url, video_thumbnail_url, like_count, comment_count, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (before) q = q.lt('created_at', before);

  const { data: posts, error } = await q;
  if (error) { log.error('db error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  const nameMap = await resolveDisplayNames(supabase, (posts ?? []).map(p => p.user_id));

  const postIds = (posts ?? []).map(p => p.id);
  const { data: myLikes } = postIds.length
    ? await supabase.from('post_likes').select('post_id').eq('user_id', req.user.id).in('post_id', postIds)
    : { data: [] };
  const likedSet = new Set((myLikes ?? []).map(l => l.post_id));

  const result = (posts ?? []).map(p => ({
    ...p, author: { userId: p.user_id, ...nameMap[p.user_id] }, liked: likedSet.has(p.id),
  }));
  res.json({ ok: true, posts: result });
});

router.post('/posts', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: membership } = await supabase
    .from('church_members').select('church_id').eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Join a church first.' });

  const { body, imageUrl, videoUrl, videoThumbnailUrl, taggedUserIds } = req.body;
  if (!body?.trim() && !imageUrl && !videoUrl) return res.status(400).json({ error: 'Post must have text or media.' });

  const { data, error } = await supabase.from('community_posts').insert({
    user_id: req.user.id,
    body: body?.trim().slice(0, 2000) ?? null,
    image_url: imageUrl ?? null,
    video_url: videoUrl ?? null,
    video_thumbnail_url: videoThumbnailUrl ?? null,
  }).select().single();
  if (error) { log.error('db error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  // Resolve names for author + all tagged users in a single DB round-trip
  const validTaggedIds = Array.isArray(taggedUserIds)
    ? taggedUserIds.filter(id => typeof id === 'string' && id !== req.user.id).slice(0, 10)
    : [];
  const nameMap = await resolveDisplayNames(supabase, [req.user.id, ...validTaggedIds]);
  const actorName = nameMap[req.user.id]?.name ?? 'Someone';

  // Build taggedUsers Author[] — client renders "— with X, Y" from this immediately
  const taggedUsers = validTaggedIds.map(id => ({
    userId: id,
    name: nameMap[id]?.name ?? `user_${id.slice(0, 6)}`,
    avatarUrl: nameMap[id]?.avatarUrl ?? null,
  }));

  // Notify tagged users (mention notifications) — fire-and-forget
  for (const userId of validTaggedIds) {
    notifyCommunity(supabase, getExpo(), {
      recipientId: userId, actorId: req.user.id, actorName,
      type: 'mention', postId: data.id,
      pushTitle: '👤 You were tagged',
      pushBody: `${actorName} tagged you in a post`,
    }).catch(() => {});
  }

  res.json({ ok: true, post: {
    ...data,
    author: { userId: req.user.id, ...nameMap[req.user.id] },
    taggedUsers,
    liked: false,
  } });
});

// Ensure the community storage bucket exists.
// _bucketReady is only set true when creation succeeds or bucket already exists.
// It is NOT set on a real error — that allows the next request to retry.
let _bucketReady = false;
async function ensureStorageBucket(supabase) {
  if (_bucketReady) return;
  try {
    const { error } = await supabase.storage.createBucket('community', {
      public: true,
      fileSizeLimit: 100 * 1024 * 1024, // 100MB
      allowedMimeTypes: ['image/*', 'video/*', 'audio/*'],
    });
    if (!error) {
      log.info('storage: community bucket created');
      _bucketReady = true;
    } else if (
      error.message?.toLowerCase().includes('already exists') ||
      error.message?.toLowerCase().includes('duplicate') ||
      error.message?.toLowerCase().includes('violates')
    ) {
      // Bucket exists — that's fine
      _bucketReady = true;
    } else {
      // Real error — log it and do NOT set _bucketReady so the next call retries
      log.error('storage: bucket creation error:', error.message);
    }
  } catch (e) {
    log.error('storage: bucket ensure threw:', e.message);
    // Do not set _bucketReady — allow retry on next request
  }
}

router.post('/posts/upload', withJsonError(upload.single('file')), async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  await ensureStorageBucket(supabase);

  const isVideo = req.file.mimetype.startsWith('video/');
  const ts = Date.now();
  const uid = req.user.id;

  if (isVideo) {
    // ── Video: compress + generate thumbnail server-side ───────────────────
    let videoBuffer = req.file.buffer;
    let thumbBuffer = null;
    try {
      ({ videoBuffer, thumbBuffer } = await compressVideo(req.file.buffer));
    } catch (err) {
      log.warn('Video compression failed, using original:', err.message);
      // Fall back to original video — compression is optional
    }

    const videoPath = `posts/${uid}/${ts}.mp4`;
    const thumbPath = `posts/${uid}/${ts}_thumb.jpg`;

    const videoUp = await supabase.storage.from('community').upload(videoPath, videoBuffer, { contentType: 'video/mp4', upsert: true });
    if (videoUp.error) { log.error('video upload error:', videoUp.error.message); return res.status(500).json({ error: 'Upload failed. Please try again.' }); }

    const { data: { publicUrl: url } } = supabase.storage.from('community').getPublicUrl(videoPath);
    let thumbnailUrl = null;
    if (thumbBuffer) {
      const thumbUp = await supabase.storage.from('community').upload(thumbPath, thumbBuffer, { contentType: 'image/jpeg', upsert: true });
      if (!thumbUp.error) {
        thumbnailUrl = supabase.storage.from('community').getPublicUrl(thumbPath).data.publicUrl;
      } else {
        log.warn('thumbnail upload failed (non-fatal):', thumbUp.error.message);
      }
    }

    return res.json({ ok: true, url, thumbnailUrl });
  }

  // ── Image: pass through unchanged ────────────────────────────────────────
  const ext  = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg';
  const imgPath = `posts/${uid}/${ts}.${ext}`;
  const { error } = await supabase.storage
    .from('community').upload(imgPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (error) {
    log.error('image upload error:', error.message);
    return res.status(500).json({ error: `Upload failed: ${error.message}` });
  }
  const path = imgPath;
  const { data: { publicUrl: url } } = supabase.storage.from('community').getPublicUrl(path);
  res.json({ ok: true, url });
});

router.post('/posts/:postId/like', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const expo = getExpo();
  const { postId } = req.params;

  const { data: existing } = await supabase.from('post_likes')
    .select('post_id').eq('post_id', postId).eq('user_id', req.user.id).maybeSingle();
  if (existing) {
    await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', req.user.id);
    const { count } = await supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
    await supabase.from('community_posts').update({ like_count: count ?? 0 }).eq('id', postId);
    return res.json({ ok: true, liked: false, likeCount: count ?? 0 });
  }

  await supabase.from('post_likes').insert({ post_id: postId, user_id: req.user.id });
  const { count } = await supabase.from('post_likes').select('*', { count: 'exact', head: true }).eq('post_id', postId);
  await supabase.from('community_posts').update({ like_count: count ?? 0 }).eq('id', postId);

  // Notify post owner
  const { data: post } = await supabase.from('community_posts').select('user_id').eq('id', postId).maybeSingle();
  if (post?.user_id) {
    const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
    const actorName = nameMap[req.user.id]?.name ?? 'Someone';
    notifyCommunity(supabase, expo, {
      recipientId: post.user_id,
      actorId: req.user.id,
      actorName,
      type: 'post_like',
      postId,
      pushTitle: '❤️ New Like',
      pushBody: `${actorName} liked your post`,
    }).catch(() => {});
  }

  res.json({ ok: true, liked: true, likeCount: count ?? 0 });
});

// DELETE a post (owner only)
router.delete('/posts/:postId', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { postId } = req.params;
  const { data: post } = await supabase.from('community_posts').select('user_id').eq('id', postId).maybeSingle();
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.user.id) return res.status(403).json({ error: 'Not your post' });
  await supabase.from('community_posts').delete().eq('id', postId);
  res.json({ ok: true });
});

router.get('/posts/:postId/comments', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { postId } = req.params;
  const { data: top, error } = await supabase.from('post_comments')
    .select('id, user_id, body, like_count, created_at')
    .eq('post_id', postId).is('parent_id', null)
    .order('created_at', { ascending: true }).limit(100);
  if (error) return res.json({ comments: [] });

  const topIds = (top ?? []).map(c => c.id);
  const [repliesRes, myLikesRes] = await Promise.allSettled([
    topIds.length
      ? supabase.from('post_comments').select('id, parent_id, user_id, body, like_count, created_at')
          .eq('post_id', postId).in('parent_id', topIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase.from('post_comment_likes').select('comment_id').eq('user_id', req.user.id),
  ]);
  const replies = repliesRes.value?.data ?? [];
  const likedIds = new Set((myLikesRes.value?.data ?? []).map(r => r.comment_id));
  const allRows = [...(top ?? []), ...replies];
  const nameMap = await resolveDisplayNames(supabase, allRows.map(c => c.user_id));

  function fmt(c) {
    return { id: c.id, author: { userId: c.user_id, ...nameMap[c.user_id] }, body: c.body,
      likeCount: c.like_count ?? 0, liked: likedIds.has(c.id), createdAt: c.created_at, replies: [] };
  }
  const map = {}, result = [];
  for (const c of (top ?? [])) { const f = fmt(c); map[c.id] = f; result.push(f); }
  for (const r of replies) { const p = map[r.parent_id]; if (p) p.replies.push(fmt(r)); }
  res.json({ ok: true, comments: result });
});

router.post('/posts/:postId/comments', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const expo = getExpo();
  const { postId } = req.params;
  const { body, parentId } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Comment body required' });
  if (body.trim().length > 2000) return res.status(400).json({ error: 'Comment too long' });

  const { data: post } = await supabase.from('community_posts').select('id, user_id').eq('id', postId).maybeSingle();
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { data, error } = await supabase.from('post_comments').insert({
    post_id: postId, user_id: req.user.id, body: body.trim(),
    parent_id: parentId ?? null,
  }).select('id, user_id, body, like_count, created_at').single();
  if (error) { log.error('post comment insert error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  // Update comment_count
  const { count } = await supabase.from('post_comments').select('*', { count: 'exact', head: true })
    .eq('post_id', postId).is('parent_id', null);
  await supabase.from('community_posts').update({ comment_count: count ?? 0 }).eq('id', postId);

  const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
  const actorName = nameMap[req.user.id]?.name ?? 'Someone';

  // Notify: post owner (if it's a top-level comment)
  if (!parentId && post.user_id !== req.user.id) {
    notifyCommunity(supabase, expo, {
      recipientId: post.user_id,
      actorId: req.user.id,
      actorName,
      type: 'comment',
      postId,
      commentId: data.id,
      pushTitle: '💬 New Comment',
      pushBody: `${actorName}: ${body.trim().slice(0, 60)}`,
    }).catch(() => {});
  }

  // Notify: parent comment author (if it's a reply)
  if (parentId) {
    const { data: parentComment } = await supabase
      .from('post_comments').select('user_id').eq('id', parentId).maybeSingle();
    if (parentComment && parentComment.user_id !== req.user.id) {
      notifyCommunity(supabase, expo, {
        recipientId: parentComment.user_id,
        actorId: req.user.id,
        actorName,
        type: 'reply',
        postId,
        commentId: data.id,
        pushTitle: '↩️ New Reply',
        pushBody: `${actorName} replied: ${body.trim().slice(0, 60)}`,
      }).catch(() => {});
    }
  }

  res.json({ ok: true, comment: { id: data.id, author: { userId: req.user.id, ...nameMap[req.user.id] },
    body: data.body, likeCount: 0, liked: false, createdAt: data.created_at, replies: [] } });
});

router.post('/posts/:postId/comments/:commentId/like', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const expo = getExpo();
  const { postId, commentId } = req.params;

  const { data: existing } = await supabase.from('post_comment_likes')
    .select('comment_id').eq('comment_id', commentId).eq('user_id', req.user.id).maybeSingle();
  const liked = !existing;
  if (existing) {
    await supabase.from('post_comment_likes').delete().eq('comment_id', commentId).eq('user_id', req.user.id);
  } else {
    await supabase.from('post_comment_likes').insert({ comment_id: commentId, user_id: req.user.id });
  }
  const { count } = await supabase.from('post_comment_likes').select('*', { count: 'exact', head: true }).eq('comment_id', commentId);
  await supabase.from('post_comments').update({ like_count: count ?? 0 }).eq('id', commentId);

  // Notify comment author when liked
  if (liked) {
    const { data: comment } = await supabase.from('post_comments').select('user_id').eq('id', commentId).maybeSingle();
    if (comment?.user_id && comment.user_id !== req.user.id) {
      const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
      const actorName = nameMap[req.user.id]?.name ?? 'Someone';
      notifyCommunity(supabase, expo, {
        recipientId: comment.user_id,
        actorId: req.user.id,
        actorName,
        type: 'comment_like',
        postId,
        commentId,
        pushTitle: '❤️ Comment Liked',
        pushBody: `${actorName} liked your comment`,
      }).catch(() => {});
    }
  }

  res.json({ ok: true, liked, likeCount: count ?? 0 });
});

// POST share a post to a chat room
router.post('/posts/:postId/share-to-room', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const expo = getExpo();
  const { postId } = req.params;
  const { roomId, note } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId is required' });

  // Verify sender is a member of the room
  const { data: membership } = await supabase.from('chat_room_members')
    .select('room_id').eq('room_id', roomId).eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Not a member of this room' });

  // Verify post exists
  const { data: post } = await supabase.from('community_posts')
    .select('id, body, image_url, video_thumbnail_url').eq('id', postId).maybeSingle();
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const body = note?.trim() ? note.trim() : (post.body?.slice(0, 100) ?? null);

  const { data: msg, error } = await supabase.from('chat_messages').insert({
    room_id: roomId,
    user_id: req.user.id,
    type: 'post_share',
    body,
    shared_post_id: postId,
  }).select('id, user_id, type, body, media_url, duration_seconds, shared_post_id, created_at').single();
  if (error) { log.error('share-to-room insert error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }

  const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
  const actorName = nameMap[req.user.id]?.name ?? 'Someone';

  // Push other room members
  const { data: otherMembers } = await supabase
    .from('chat_room_members').select('user_id').eq('room_id', roomId).neq('user_id', req.user.id);
  const { data: roomInfo } = await supabase.from('chat_rooms').select('type, name').eq('id', roomId).maybeSingle();
  const pushPromises = (otherMembers ?? []).map(m =>
    notifyCommunity(supabase, expo, {
      recipientId: m.user_id,
      actorId: req.user.id,
      actorName,
      type: 'dm_message',
      roomId,
      messageId: msg.id,
      pushTitle: roomInfo?.type === 'dm' ? actorName : `${actorName} in ${roomInfo?.name ?? 'General'}`,
      pushBody: '📤 Shared a post',
    })
  );
  Promise.allSettled(pushPromises).catch(() => {});

  res.json({ ok: true, message: { ...msg, sender: { userId: req.user.id, ...nameMap[req.user.id] }, sharedPost: { id: post.id, body: post.body, thumbnailUrl: post.video_thumbnail_url ?? post.image_url } } });
});

// ── Message requests ──────────────────────────────────────────────────────────
router.get('/message-requests', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('message_requests')
    .select('id, room_id, sender_id, receiver_id, status, created_at')
    .eq('receiver_id', req.user.id)
    .order('created_at', { ascending: false });
  if (error) {
    // Gracefully handle missing table (schema not yet applied)
    if (error.code === '42P01') return res.json({ ok: true, requests: [] });
    log.error('message-requests fetch error:', error.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  // Enrich with sender display name — user_profiles.id IS the user UUID (PK)
  const senderIds = [...new Set((data ?? []).map(r => r.sender_id).filter(Boolean))];
  const nameMap = senderIds.length ? await resolveDisplayNames(supabase, senderIds) : {};

  res.json({
    ok: true,
    requests: (data ?? []).map(r => ({
      id: r.id,
      roomId: r.room_id ?? null,
      status: r.status,
      createdAt: r.created_at,
      fromUser: {
        userId: r.sender_id,
        name: nameMap[r.sender_id]?.name ?? 'Member',
        avatarUrl: nameMap[r.sender_id]?.avatarUrl ?? null,
      },
      toUserId: r.receiver_id,
    })),
  });
});

router.put('/message-requests/:requestId/respond', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { requestId } = req.params;
  const { action } = req.body; // 'accept' | 'reject' | 'block'
  if (!['accept', 'reject', 'block'].includes(action)) {
    return res.status(400).json({ error: 'action must be accept, reject, or block' });
  }

  const { data: req_, error: findErr } = await supabase
    .from('message_requests')
    .select('id, sender_id, receiver_id, room_id')
    .eq('id', requestId)
    .eq('receiver_id', req.user.id)
    .maybeSingle();
  if (findErr || !req_) return res.status(404).json({ error: 'Request not found' });

  const newStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'blocked';
  await supabase.from('message_requests').update({ status: newStatus }).eq('id', requestId);

  if (action === 'block') {
    await supabase.from('blocked_users').upsert(
      { user_id: req.user.id, blocked_user_id: req_.sender_id },
      { onConflict: 'user_id,blocked_user_id' }
    );
  }

  res.json({ ok: true, status: newStatus });
});

// ── Block / unblock ──────────────────────────────────────────────────────────
router.post('/block', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  await supabase.from('blocked_users').upsert(
    { user_id: req.user.id, blocked_user_id: userId },
    { onConflict: 'user_id,blocked_user_id' }
  );
  res.json({ ok: true });
});

router.post('/unblock', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  await supabase.from('blocked_users')
    .delete()
    .eq('user_id', req.user.id)
    .eq('blocked_user_id', userId);
  res.json({ ok: true });
});

router.get('/blocked', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_user_id, created_at')
    .eq('user_id', req.user.id);
  if (error) { log.error('blocked-users fetch error:', error.message); return res.status(500).json({ error: 'Something went wrong. Please try again.' }); }
  res.json({ blocked: data ?? [] });
});

// ── Partner read receipt ──────────────────────────────────────────────────────
router.get('/rooms/:roomId/partner-read', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { roomId } = req.params;

  // Verify requester is a member
  const { data: myMembership } = await supabase
    .from('chat_room_members').select('room_id').eq('room_id', roomId).eq('user_id', req.user.id).maybeSingle();
  if (!myMembership) return res.status(403).json({ error: 'Not a member' });

  // Get the OTHER member's last_read_at
  const { data: partner } = await supabase
    .from('chat_room_members')
    .select('last_read_at')
    .eq('room_id', roomId)
    .neq('user_id', req.user.id)
    .maybeSingle();

  res.json({ lastReadAt: partner?.last_read_at ?? null });
});

// ── User search ───────────────────────────────────────────────────────────────
router.get('/users/search', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const q = String(req.query.q ?? '').trim();
  if (!q || q.length < 2) return res.json({ ok: true, users: [] });
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, display_name, bio, avatar_url, username, church_affiliation, location, state, country')
    .or(`display_name.ilike.%${q}%,username.ilike.%${q}%`)
    .neq('id', req.user.id)
    .limit(30);
  if (error) { log.error('user-search error:', error.message); return res.status(500).json({ error: 'Search failed' }); }
  res.json({ ok: true, users: data ?? [] });
});

// ── Connections ───────────────────────────────────────────────────────────────
router.get('/connections', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const userId = req.user.id;
  const { data, error } = await supabase
    .from('user_connections')
    .select('id, requester_id, addressee_id, status, created_at')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted');
  if (error) return res.status(500).json({ error: 'Could not fetch connections' });
  const otherIds = (data ?? []).map(c => c.requester_id === userId ? c.addressee_id : c.requester_id);
  const names = otherIds.length ? await resolveDisplayNames(supabase, otherIds) : {};
  const connections = (data ?? []).map(c => {
    const otherId = c.requester_id === userId ? c.addressee_id : c.requester_id;
    return { id: c.id, userId: otherId, name: names[otherId]?.name ?? 'Member', avatarUrl: names[otherId]?.avatarUrl ?? null, status: c.status, createdAt: c.created_at };
  });
  res.json({ ok: true, connections });
});

router.get('/connections/requests', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('user_connections')
    .select('id, requester_id, status, created_at')
    .eq('addressee_id', req.user.id)
    .eq('status', 'pending');
  if (error) return res.status(500).json({ error: 'Could not fetch requests' });
  const names = data?.length ? await resolveDisplayNames(supabase, data.map(r => r.requester_id)) : {};
  const requests = (data ?? []).map(r => ({
    id: r.id, userId: r.requester_id,
    name: names[r.requester_id]?.name ?? 'Member',
    avatarUrl: names[r.requester_id]?.avatarUrl ?? null,
    status: r.status, createdAt: r.created_at,
  }));
  res.json({ ok: true, requests });
});

router.post('/connections/request', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });
  if (targetUserId === req.user.id) return res.status(400).json({ error: 'Cannot connect with yourself' });
  // Check existing in either direction
  const { data: existing } = await supabase
    .from('user_connections')
    .select('id, status')
    .or(`and(requester_id.eq.${req.user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${req.user.id})`)
    .maybeSingle();
  if (existing) {
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Already connected' });
    if (existing.status === 'pending') return res.json({ ok: true, connection: { id: existing.id, status: 'pending', requesterId: req.user.id } });
  }
  const { data, error } = await supabase
    .from('user_connections')
    .insert({ requester_id: req.user.id, addressee_id: targetUserId, status: 'pending' })
    .select().single();
  if (error) { log.error('connection-request error:', error.message); return res.status(500).json({ error: 'Could not send request' }); }
  res.json({ ok: true, connection: data });
});

router.put('/connections/:id', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { action } = req.body;
  if (!['accept', 'decline', 'block'].includes(action)) return res.status(400).json({ error: 'action must be accept, decline, or block' });
  const { data: conn } = await supabase.from('user_connections').select('*').eq('id', req.params.id).maybeSingle();
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  if (conn.addressee_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  if (action === 'decline') {
    await supabase.from('user_connections').delete().eq('id', req.params.id);
    return res.json({ ok: true });
  }
  const status = action === 'block' ? 'blocked' : 'accepted';
  const { data, error } = await supabase.from('user_connections').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'Could not update connection' });
  res.json({ ok: true, connection: data });
});

router.delete('/connections/:id', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: conn } = await supabase.from('user_connections').select('requester_id, addressee_id').eq('id', req.params.id).maybeSingle();
  if (!conn) return res.status(404).json({ error: 'Not found' });
  if (conn.requester_id !== req.user.id && conn.addressee_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  await supabase.from('user_connections').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

router.get('/connections/status/:userId', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const me = req.user.id;
  const them = req.params.userId;
  const { data } = await supabase
    .from('user_connections')
    .select('id, status, requester_id, addressee_id, created_at')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${them}),and(requester_id.eq.${them},addressee_id.eq.${me})`)
    .maybeSingle();
  res.json({ ok: true, connection: data ?? null });
});

// ── User posts ─────────────────────────────────────────────────────────────────
router.get('/profile/:userId/posts', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data, error } = await supabase
    .from('community_posts')
    .select('id, body, image_url, video_url, video_thumbnail_url, like_count, comment_count, created_at')
    .eq('user_id', req.params.userId)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) return res.status(500).json({ error: 'Could not fetch posts' });
  res.json({ ok: true, posts: data ?? [] });
});

// ── Stories ───────────────────────────────────────────────────────────────────
const storyUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 }, fileFilter: mimeFilter(ALLOWED_POST_TYPES) });

router.get('/stories', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const me = req.user.id;
  // Get accepted connections
  const { data: conns } = await supabase
    .from('user_connections')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${me},addressee_id.eq.${me}`)
    .eq('status', 'accepted');
  const connectedIds = (conns ?? []).map(c => c.requester_id === me ? c.addressee_id : c.requester_id);
  const visibleIds = [me, ...connectedIds];
  const { data: stories, error } = await supabase
    .from('community_stories')
    .select('id, user_id, media_url, media_type, caption, expires_at, created_at')
    .in('user_id', visibleIds)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) {
    // Gracefully return empty if table doesn't exist yet
    if (error.code === '42P01') return res.json({ ok: true, stories: [] });
    return res.status(500).json({ error: 'Could not fetch stories' });
  }
  const storyIds = (stories ?? []).map(s => s.id);
  const { data: views } = storyIds.length
    ? await supabase.from('story_views').select('story_id, viewer_id').in('story_id', storyIds)
    : { data: [] };
  const viewCounts = {};
  const seenByMe = new Set();
  for (const v of (views ?? [])) {
    viewCounts[v.story_id] = (viewCounts[v.story_id] ?? 0) + 1;
    if (v.viewer_id === me) seenByMe.add(v.story_id);
  }
  const authorIds = [...new Set((stories ?? []).map(s => s.user_id))];
  const names = authorIds.length ? await resolveDisplayNames(supabase, authorIds) : {};
  const result = (stories ?? []).map(s => ({
    id: s.id, userId: s.user_id,
    authorName: names[s.user_id]?.name ?? 'Member',
    authorAvatarUrl: names[s.user_id]?.avatarUrl ?? null,
    mediaUrl: s.media_url, mediaType: s.media_type,
    caption: s.caption ?? null, expiresAt: s.expires_at, createdAt: s.created_at,
    viewCount: viewCounts[s.id] ?? 0, seenByMe: seenByMe.has(s.id),
  }));
  res.json({ ok: true, stories: result });
});

router.post('/stories/upload', withJsonError(storyUpload.single('file')), async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  await ensureStorageBucket(supabase);
  const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `stories/${req.user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('community').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (error) { log.error('story upload error:', error.message); return res.status(500).json({ error: 'Upload failed' }); }
  const { data: { publicUrl } } = supabase.storage.from('community').getPublicUrl(path);
  const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'photo';
  res.json({ ok: true, url: publicUrl, mediaType });
});

router.post('/stories', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { mediaUrl, mediaType, caption } = req.body;
  if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl required' });
  const { data, error } = await supabase.from('community_stories')
    .insert({ user_id: req.user.id, media_url: mediaUrl, media_type: mediaType ?? 'photo', caption: caption ?? null })
    .select().single();
  if (error) { log.error('create story error:', error.message); return res.status(500).json({ error: 'Could not create story' }); }
  const names = await resolveDisplayNames(supabase, [req.user.id]);
  res.json({ ok: true, story: { ...data, userId: data.user_id, authorName: names[req.user.id]?.name ?? 'Member', authorAvatarUrl: names[req.user.id]?.avatarUrl ?? null, viewCount: 0, seenByMe: false } });
});

router.post('/stories/:id/view', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  await supabase.from('story_views').upsert({ story_id: req.params.id, viewer_id: req.user.id }, { onConflict: 'story_id,viewer_id' });
  res.json({ ok: true });
});

router.delete('/stories/:id', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: story } = await supabase.from('community_stories').select('user_id, media_url').eq('id', req.params.id).maybeSingle();
  if (!story) return res.status(404).json({ error: 'Not found' });
  if (story.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  const storagePath = story.media_url.split('/community/')[1];
  if (storagePath) await supabase.storage.from('community').remove([storagePath]).catch(() => {});
  await supabase.from('community_stories').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

export { router as communityRouter };
