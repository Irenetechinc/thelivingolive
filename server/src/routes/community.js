/**
 * community.js — Olive Chat community API
 * Mounted at /api/community in index.js.
 * All endpoints require Supabase JWT (requireUser in index.js).
 * Operations that need service-role (resolving names, creating DM rooms, etc.)
 * use req.app.locals.supabaseAdmin.
 */

import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import { logger } from '../lib/logger.js';

const log = logger('community');
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ── PIN helpers ───────────────────────────────────────────────────────────────
// Uses PBKDF2 with userId as salt so the hash is unique per user.
function hashPin(pin, userId) {
  return crypto.pbkdf2Sync(String(pin), userId, 10_000, 32, 'sha256').toString('hex');
}

// ── User-name resolution (reuses pattern from bulletins.js) ──────────────────
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

// Also check user_profiles for display_name (preferred over auth metadata)
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

// GET own profile
router.get('/profile', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const userId = req.user.id;
  let { data } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
  if (!data) {
    // Auto-create profile if trigger missed it
    const authNames = await resolveNames(supabase, [userId]);
    const { data: created } = await supabase.from('user_profiles')
      .insert({ id: userId, display_name: authNames[userId] })
      .select().single();
    data = created;
  }
  // Never expose the pin hash
  const { chat_pin_hash: _, ...safe } = data ?? {};
  res.json({ ok: true, profile: { ...safe, email: req.user.email } });
});

// GET any user's public profile
router.get('/profile/:userId', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data } = await supabase
    .from('user_profiles')
    .select('id, display_name, bio, avatar_url, cover_url, date_of_birth')
    .eq('id', req.params.userId)
    .maybeSingle();
  if (!data) return res.status(404).json({ error: 'Profile not found' });
  res.json({ ok: true, profile: data });
});

// PUT update own profile
router.put('/profile', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { displayName, bio, dateOfBirth } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (displayName !== undefined) updates.display_name = String(displayName).slice(0, 60).trim() || null;
  if (bio !== undefined) updates.bio = String(bio).slice(0, 500).trim() || null;
  if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth || null;
  await supabase.from('user_profiles').upsert({ id: req.user.id, ...updates }, { onConflict: 'id' });
  res.json({ ok: true });
});

// POST set / change PIN (4–8 digits)
router.post('/profile/set-pin', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { pin } = req.body;
  if (pin === null || pin === undefined || pin === '') {
    // Remove PIN
    await supabase.from('user_profiles').upsert({ id: req.user.id, chat_pin_hash: null }, { onConflict: 'id' });
    return res.json({ ok: true, pinSet: false });
  }
  if (!/^\d{4,8}$/.test(String(pin))) {
    return res.status(400).json({ error: 'PIN must be 4–8 digits' });
  }
  const hash = hashPin(String(pin), req.user.id);
  await supabase.from('user_profiles').upsert({ id: req.user.id, chat_pin_hash: hash }, { onConflict: 'id' });
  res.json({ ok: true, pinSet: true });
});

// POST validate PIN
router.post('/profile/validate-pin', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'pin is required' });
  const { data } = await supabase
    .from('user_profiles').select('chat_pin_hash').eq('id', req.user.id).maybeSingle();
  if (!data?.chat_pin_hash) return res.json({ ok: true, valid: true }); // no PIN set
  const hash = hashPin(String(pin), req.user.id);
  res.json({ ok: true, valid: hash === data.chat_pin_hash });
});

// GET whether a PIN is set for current user
router.get('/profile/pin-status', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data } = await supabase
    .from('user_profiles').select('chat_pin_hash').eq('id', req.user.id).maybeSingle();
  res.json({ ok: true, pinSet: !!data?.chat_pin_hash });
});

// POST upload avatar or cover image
const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/profile/upload/:type', avatarUpload.single('file'), async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { type } = req.params; // 'avatar' | 'cover'
  if (!['avatar', 'cover'].includes(type)) return res.status(400).json({ error: 'type must be avatar or cover' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `profiles/${req.user.id}/${type}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('community')
    .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (error) return res.status(500).json({ error: error.message });
  const { data: { publicUrl } } = supabase.storage.from('community').getPublicUrl(path);
  const field = type === 'avatar' ? 'avatar_url' : 'cover_url';
  await supabase.from('user_profiles').upsert({ id: req.user.id, [field]: publicUrl }, { onConflict: 'id' });
  res.json({ ok: true, url: publicUrl });
});

// ── Church members list (for DM picker + feed gating) ────────────────────────
router.get('/members', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  // Get user's church
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

// GET all rooms the current user belongs to (with last message + unread count)
router.get('/rooms', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  // Verify user belongs to a church
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

  // Last message for each room
  const lastMsgPromises = roomIds.map(rid =>
    supabase.from('chat_messages').select('body, type, media_url, created_at, user_id')
      .eq('room_id', rid).order('created_at', { ascending: false }).limit(1)
  );
  const lastMsgs = await Promise.allSettled(lastMsgPromises);

  // Unread count for each room
  const unreadPromises = roomIds.map((rid, i) =>
    readMap[rid]
      ? supabase.from('chat_messages').select('*', { count: 'exact', head: true })
          .eq('room_id', rid).gt('created_at', readMap[rid]).neq('user_id', req.user.id)
      : Promise.resolve({ count: 0 })
  );
  const unreadResults = await Promise.allSettled(unreadPromises);

  // For DMs: get the other member's profile
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

  // Sort: group first, then DMs by last message time
  result.sort((a, b) => {
    if (a.type === 'group' && b.type !== 'group') return -1;
    if (b.type === 'group' && a.type !== 'group') return 1;
    const aTime = a.lastMessage?.createdAt ?? '0';
    const bTime = b.lastMessage?.createdAt ?? '0';
    return bTime.localeCompare(aTime);
  });

  res.json({ ok: true, rooms: result });
});

// POST get-or-create DM room with another user
router.post('/rooms/dm', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { targetUserId } = req.body;
  if (!targetUserId || targetUserId === req.user.id) return res.status(400).json({ error: 'Invalid target user' });

  // Check if both users belong to a church (community gating)
  const { data: myMembership } = await supabase
    .from('church_members').select('church_id').eq('user_id', req.user.id).maybeSingle();
  if (!myMembership) return res.status(403).json({ error: 'You must belong to a church.' });

  // Find existing DM room between these two users
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

  // Create new DM room
  const { data: room, error } = await supabase.from('chat_rooms')
    .insert({ type: 'dm', name: null }).select('id').single();
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from('chat_room_members').insert([
    { room_id: room.id, user_id: req.user.id },
    { room_id: room.id, user_id: targetUserId },
  ]);
  res.json({ ok: true, roomId: room.id });
});

// GET messages for a room (paginated, newest last)
router.get('/rooms/:roomId/messages', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { roomId } = req.params;
  const before = req.query.before; // ISO timestamp cursor
  const limit = Math.min(parseInt(req.query.limit ?? '40', 10), 100);

  // Verify user is a member
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
  if (error) return res.status(500).json({ error: error.message });

  const nameMap = await resolveDisplayNames(supabase, (msgs ?? []).map(m => m.user_id));
  const messages = (msgs ?? []).reverse().map(m => ({
    ...m, sender: { userId: m.user_id, ...nameMap[m.user_id] },
  }));
  res.json({ ok: true, messages });
});

// POST send a message
router.post('/rooms/:roomId/messages', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
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
  if (error) return res.status(500).json({ error: error.message });

  const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
  res.json({ ok: true, message: { ...msg, sender: { userId: req.user.id, ...nameMap[req.user.id] } } });
});

// PUT mark room as read
router.put('/rooms/:roomId/read', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  await supabase.from('chat_room_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('room_id', req.params.roomId).eq('user_id', req.user.id);
  res.json({ ok: true });
});

// POST upload message media (image or voice note)
const mediaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.post('/rooms/:roomId/upload', mediaUpload.single('file'), async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `messages/${req.params.roomId}/${req.user.id}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('community').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (error) return res.status(500).json({ error: error.message });
  const { data: { publicUrl } } = supabase.storage.from('community').getPublicUrl(path);
  res.json({ ok: true, url: publicUrl });
});

// ── Timeline posts ────────────────────────────────────────────────────────────

// GET general timeline feed (paginated)
router.get('/timeline', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  // Gate: must belong to a church
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
  if (error) return res.status(500).json({ error: error.message });

  const nameMap = await resolveDisplayNames(supabase, (posts ?? []).map(p => p.user_id));

  // Get current user's likes for these posts
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

// POST create a post
router.post('/posts', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { data: membership } = await supabase
    .from('church_members').select('church_id').eq('user_id', req.user.id).maybeSingle();
  if (!membership) return res.status(403).json({ error: 'Join a church first.' });

  const { body, imageUrl, videoUrl, videoThumbnailUrl } = req.body;
  if (!body?.trim() && !imageUrl && !videoUrl) return res.status(400).json({ error: 'Post must have text or media.' });

  const { data, error } = await supabase.from('community_posts').insert({
    user_id: req.user.id,
    body: body?.trim().slice(0, 2000) ?? null,
    image_url: imageUrl ?? null,
    video_url: videoUrl ?? null,
    video_thumbnail_url: videoThumbnailUrl ?? null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
  res.json({ ok: true, post: { ...data, author: { userId: req.user.id, ...nameMap[req.user.id] }, liked: false } });
});

// POST upload post media (image or video)
router.post('/posts/upload', upload.single('file'), async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const ext = req.file.originalname.split('.').pop()?.toLowerCase() ?? 'bin';
  const path = `posts/${req.user.id}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('community').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
  if (error) return res.status(500).json({ error: error.message });
  const { data: { publicUrl } } = supabase.storage.from('community').getPublicUrl(path);
  res.json({ ok: true, url: publicUrl });
});

// POST toggle post like
router.post('/posts/:postId/like', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
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
  res.json({ ok: true, liked: true, likeCount: count ?? 0 });
});

// GET comments for a post
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

// POST add a comment (or reply)
router.post('/posts/:postId/comments', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { postId } = req.params;
  const { body, parentId } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Comment body required' });
  if (body.trim().length > 2000) return res.status(400).json({ error: 'Comment too long' });

  const { data: post } = await supabase.from('community_posts').select('id').eq('id', postId).maybeSingle();
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { data, error } = await supabase.from('post_comments').insert({
    post_id: postId, user_id: req.user.id, body: body.trim(),
    parent_id: parentId ?? null,
  }).select('id, user_id, body, like_count, created_at').single();
  if (error) return res.status(500).json({ error: error.message });

  // Update comment_count
  const { count } = await supabase.from('post_comments').select('*', { count: 'exact', head: true })
    .eq('post_id', postId).is('parent_id', null);
  await supabase.from('community_posts').update({ comment_count: count ?? 0 }).eq('id', postId);

  const nameMap = await resolveDisplayNames(supabase, [req.user.id]);
  res.json({ ok: true, comment: { id: data.id, author: { userId: req.user.id, ...nameMap[req.user.id] },
    body: data.body, likeCount: 0, liked: false, createdAt: data.created_at, replies: [] } });
});

// POST toggle comment like
router.post('/posts/:postId/comments/:commentId/like', async (req, res) => {
  const supabase = req.app.locals.supabaseAdmin;
  const { commentId } = req.params;
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
  res.json({ ok: true, liked, likeCount: count ?? 0 });
});

export { router as communityRouter };
