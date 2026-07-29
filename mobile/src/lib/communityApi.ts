/**
 * communityApi.ts — Olive Chat / community feature API helpers.
 * Uses the Supabase client directly for data operations (RLS covers auth),
 * and falls back to the Express server for operations requiring service-role
 * (PIN hashing, DM room creation, member resolution).
 */

import { supabase } from './supabase';
import { PRODUCTION_API_URL } from './api';

const API = PRODUCTION_API_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

export type UserProfile = {
  id: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  dateOfBirth: string | null;
  email?: string;
  pinSet?: boolean;
};

export type Author = { userId: string; name: string; avatarUrl: string | null };

export type CommunityPost = {
  id: string;
  author: Author;
  body: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  videoThumbnailUrl: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAt: string;
};

export type PostComment = {
  id: string;
  author: Author;
  body: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
  replies: PostComment[];
};

export type ChatRoom = {
  id: string;
  name: string | null;
  type: 'group' | 'dm';
  churchId: string | null;
  otherUser: Author | null;
  lastMessage: { body: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  sender: Author;
  type: 'text' | 'image' | 'voice' | 'post_share';
  body: string | null;
  mediaUrl: string | null;
  durationSeconds: number | null;
  sharedPostId: string | null;
  createdAt: string;
};

// ── Auth helper ───────────────────────────────────────────────────────────────
async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function apiCall<T = any>(path: string, method = 'GET', body?: object): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

async function uploadFile(path: string, uri: string, mimeType: string): Promise<string> {
  const headers = await authHeader();
  delete (headers as any)['Content-Type']; // let browser set multipart boundary
  const fd = new FormData();
  fd.append('file', { uri, name: uri.split('/').pop() ?? 'file', type: mimeType } as any);
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: fd, signal: AbortSignal.timeout(120_000) });
  const json = await res.json().catch(() => ({ error: `Upload failed (${res.status})` }));
  if (!res.ok || json.error) throw new Error(json.error ?? 'Upload failed');
  return json.url as string;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export async function getMyProfile(): Promise<UserProfile> {
  const r = await apiCall<any>('/api/community/profile');
  const p = r.profile;
  return {
    id: p.id, displayName: p.display_name ?? null, bio: p.bio ?? null,
    avatarUrl: p.avatar_url ?? null, coverUrl: p.cover_url ?? null,
    dateOfBirth: p.date_of_birth ?? null, email: p.email,
  };
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const r = await apiCall<any>(`/api/community/profile/${userId}`);
  const p = r.profile;
  return { id: p.id, displayName: p.display_name ?? null, bio: p.bio ?? null,
    avatarUrl: p.avatar_url ?? null, coverUrl: p.cover_url ?? null, dateOfBirth: p.date_of_birth ?? null };
}

export async function updateProfile(updates: { displayName?: string; bio?: string; dateOfBirth?: string }): Promise<void> {
  await apiCall('/api/community/profile', 'PUT', updates);
}

export async function uploadAvatar(uri: string): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  return uploadFile('/api/community/profile/upload/avatar', uri, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
}

export async function uploadCover(uri: string): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  return uploadFile('/api/community/profile/upload/cover', uri, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
}

export async function getPinStatus(): Promise<boolean> {
  const r = await apiCall<any>('/api/community/profile/pin-status');
  return r.pinSet === true;
}

export async function setPin(pin: string | null): Promise<void> {
  await apiCall('/api/community/profile/set-pin', 'POST', { pin });
}

export async function validatePin(pin: string): Promise<boolean> {
  const r = await apiCall<any>('/api/community/profile/validate-pin', 'POST', { pin });
  return r.valid === true;
}

// ── Members ───────────────────────────────────────────────────────────────────

export async function getChurchMembers(): Promise<Author[]> {
  const r = await apiCall<any>('/api/community/members');
  return (r.members ?? []).map((m: any) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl ?? null }));
}

// ── Chat rooms ────────────────────────────────────────────────────────────────

export async function getRooms(): Promise<ChatRoom[]> {
  const r = await apiCall<any>('/api/community/rooms');
  return r.rooms ?? [];
}

export async function getOrCreateDM(targetUserId: string): Promise<string> {
  const r = await apiCall<any>('/api/community/rooms/dm', 'POST', { targetUserId });
  return r.roomId as string;
}

export async function getRoomMessages(roomId: string, before?: string): Promise<ChatMessage[]> {
  const qs = before ? `?before=${encodeURIComponent(before)}` : '';
  const r = await apiCall<any>(`/api/community/rooms/${roomId}/messages${qs}`);
  return (r.messages ?? []).map((m: any): ChatMessage => ({
    id: m.id, sender: { userId: m.sender.userId, name: m.sender.name, avatarUrl: m.sender.avatarUrl ?? null },
    type: m.type, body: m.body ?? null, mediaUrl: m.media_url ?? null,
    durationSeconds: m.duration_seconds ?? null, sharedPostId: m.shared_post_id ?? null, createdAt: m.created_at,
  }));
}

export async function sendMessage(roomId: string, payload: {
  type: 'text' | 'image' | 'voice' | 'post_share';
  body?: string; mediaUrl?: string; durationSeconds?: number; sharedPostId?: string;
}): Promise<ChatMessage> {
  const r = await apiCall<any>(`/api/community/rooms/${roomId}/messages`, 'POST', payload);
  const m = r.message;
  return { id: m.id, sender: { userId: m.sender.userId, name: m.sender.name, avatarUrl: m.sender.avatarUrl ?? null },
    type: m.type, body: m.body ?? null, mediaUrl: m.media_url ?? null,
    durationSeconds: m.duration_seconds ?? null, sharedPostId: m.shared_post_id ?? null, createdAt: m.created_at };
}

export async function uploadMessageMedia(roomId: string, uri: string, type: 'image' | 'voice'): Promise<string> {
  const mimeType = type === 'voice' ? 'audio/m4a' : `image/${uri.split('.').pop()?.toLowerCase() ?? 'jpeg'}`;
  const headers = await authHeader();
  delete (headers as any)['Content-Type'];
  const fd = new FormData();
  fd.append('file', { uri, name: uri.split('/').pop() ?? 'file', type: mimeType } as any);
  const res = await fetch(`${API}/api/community/rooms/${roomId}/upload`, { method: 'POST', headers, body: fd, signal: AbortSignal.timeout(60_000) });
  const json = await res.json().catch(() => ({ error: 'Upload failed' }));
  if (!res.ok || json.error) throw new Error(json.error ?? 'Upload failed');
  return json.url as string;
}

export async function markRoomRead(roomId: string): Promise<void> {
  await apiCall(`/api/community/rooms/${roomId}/read`, 'PUT');
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export async function getTimeline(before?: string): Promise<CommunityPost[]> {
  const qs = before ? `?before=${encodeURIComponent(before)}` : '';
  const r = await apiCall<any>(`/api/community/timeline${qs}`);
  return (r.posts ?? []).map(mapPost);
}

export async function createPost(payload: {
  body?: string; imageUrl?: string; videoUrl?: string; videoThumbnailUrl?: string;
}): Promise<CommunityPost> {
  const r = await apiCall<any>('/api/community/posts', 'POST', payload);
  return mapPost(r.post);
}

export async function uploadPostMedia(uri: string, mimeType: string): Promise<string> {
  return uploadFile('/api/community/posts/upload', uri, mimeType);
}

export async function togglePostLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  const r = await apiCall<any>(`/api/community/posts/${postId}/like`, 'POST');
  return { liked: r.liked, likeCount: r.likeCount };
}

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const r = await apiCall<any>(`/api/community/posts/${postId}/comments`);
  return r.comments ?? [];
}

export async function addPostComment(postId: string, body: string, parentId?: string): Promise<PostComment> {
  const r = await apiCall<any>(`/api/community/posts/${postId}/comments`, 'POST', { body, parentId });
  return r.comment;
}

export async function toggleCommentLike(postId: string, commentId: string): Promise<{ liked: boolean; likeCount: number }> {
  const r = await apiCall<any>(`/api/community/posts/${postId}/comments/${commentId}/like`, 'POST');
  return { liked: r.liked, likeCount: r.likeCount };
}

// ── Supabase Realtime subscription for a chat room ────────────────────────────
export function subscribeToRoom(
  roomId: string,
  onMessage: (msg: ChatMessage) => void
) {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` },
      async (payload) => {
        const raw = payload.new as any;
        // Fetch sender display name
        const { data: profile } = await supabase
          .from('user_profiles').select('display_name, avatar_url').eq('id', raw.user_id).maybeSingle();
        const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        const name = profile?.display_name || user?.email?.split('@')[0] || `user_${raw.user_id.slice(0, 6)}`;
        onMessage({
          id: raw.id, type: raw.type, body: raw.body ?? null,
          mediaUrl: raw.media_url ?? null, durationSeconds: raw.duration_seconds ?? null,
          sharedPostId: raw.shared_post_id ?? null, createdAt: raw.created_at,
          sender: { userId: raw.user_id, name, avatarUrl: profile?.avatar_url ?? null },
        });
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Internal mapper ───────────────────────────────────────────────────────────
function mapPost(p: any): CommunityPost {
  return {
    id: p.id, body: p.body ?? null, imageUrl: p.image_url ?? null,
    videoUrl: p.video_url ?? null, videoThumbnailUrl: p.video_thumbnail_url ?? null,
    likeCount: p.like_count ?? 0, commentCount: p.comment_count ?? 0,
    liked: p.liked ?? false, createdAt: p.created_at,
    author: { userId: p.author?.userId ?? p.user_id, name: p.author?.name ?? 'Member', avatarUrl: p.author?.avatarUrl ?? null },
  };
}
