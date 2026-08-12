/**
 * pushHelper.js — shared push notification helper for community events.
 * Imported by community.js (and any other route that needs to send a push).
 * The Expo client and supabaseAdmin are passed in so this file stays stateless.
 */
import { Expo } from 'expo-server-sdk';

/**
 * Send an Expo push notification to all devices registered by `userId`.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseAdmin
 * @param {Expo} expo
 * @param {string} userId
 * @param {{ title: string, body: string, data?: object }} payload
 */
export async function sendPushToUser(supabaseAdmin, expo, userId, { title, body, data = {} }) {
  if (!supabaseAdmin || !expo) return;
  try {
    const { data: rows } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId);
    if (!rows?.length) return;

    const messages = rows
      .filter(r => Expo.isExpoPushToken(r.token))
      .map(r => ({ to: r.token, sound: 'default', title, body, data }));
    if (!messages.length) return;

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk).catch(e =>
        console.warn('[pushHelper] chunk failed:', e.message)
      );
    }
  } catch (e) {
    console.warn('[pushHelper] sendPushToUser error:', e.message);
  }
}

/**
 * Insert a community notification row and optionally send a push.
 * Silently no-ops if recipient === actor (no self-notifications).
 */
export async function notifyCommunity(supabaseAdmin, expo, {
  recipientId,
  actorId,
  actorName,
  type,       // 'post_like' | 'comment_like' | 'comment' | 'reply' | 'dm_message' | 'new_post'
  postId,
  commentId,
  roomId,
  messageId,
  pushTitle,
  pushBody,
}) {
  if (!supabaseAdmin) return;
  if (recipientId === actorId) return;  // no self-notifications

  try {
    await supabaseAdmin.from('community_notifications').insert({
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      post_id: postId ?? null,
      comment_id: commentId ?? null,
      room_id: roomId ?? null,
      message_id: messageId ?? null,
    });
  } catch {}

  if (pushTitle && pushBody && expo) {
    await sendPushToUser(supabaseAdmin, expo, recipientId, {
      title: pushTitle,
      body: pushBody,
      data: { type, postId, commentId, roomId, messageId },
    });
  }
}
