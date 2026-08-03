/**
 * OliveChatScreen — Olive Chat main screen.
 * Tabs: Feed (timeline) | Chats (rooms) | Profile
 * Gated by church membership + optional PIN lock.
 *
 * Fixes / additions over prior version:
 *  - Comment like count updates live in CommentsSheet
 *  - Real-time timeline subscription (new posts appear instantly)
 *  - In-app Share-to-room dialog (ShareToRoomModal)
 *  - Age computed from date_of_birth in profile
 *  - Notifications tab with unread badge
 *  - Delete own post
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ScrollView, ActivityIndicator, Image, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Share, Alert, RefreshControl,
  Animated, ViewToken,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors, radii, spacing, typography, shadows } from '../../theme/theme';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import {
  getMyProfile, updateProfile, uploadAvatar, uploadCover,
  getPinStatus, setPin, validatePin,
  getRooms, getTimeline, createPost, uploadPostMedia, deletePost,
  togglePostLike, getPostComments, addPostComment, toggleCommentLike,
  sharePostToRoom, getNotifications, markNotificationsRead,
  getMessageRequests, respondToRequest, blockUser, getChurchMembers,
  subscribeToTimeline, subscribeToNotifications, subscribeToMessageRequests,
  type UserProfile, type CommunityPost, type PostComment,
  type ChatRoom, type CommunityNotification, type MessageRequest, type Author,
} from '../../lib/communityApi';
import { supabase } from '../../lib/supabase';
import OliveChatSplash from '../../components/OliveChatSplash';
import { SkeletonBox, PostSkeleton, ChatRoomSkeleton, NotifSkeleton } from '../../components/SkeletonCard';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'feed' | 'chats' | 'profile' | 'notifications';

// ── Helpers ───────────────────────────────────────────────────────────────────
function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age > 0 ? age : null;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.parchmentDark }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.36, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

// ── Video thumbnail placeholder (no player — shown when post is off-screen) ──
// Renders a static image + play icon without creating any native player object.
// This avoids allocating a useVideoPlayer() instance for every video in the feed
// regardless of scroll position, which was the root cause of the video-scroll crash.
function VideoThumbnailPlaceholder({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  return (
    <View style={vs.wrap}>
      {thumbnailUrl
        ? <Image source={{ uri: thumbnailUrl }} style={vs.thumb} resizeMode="cover" />
        : <View style={[vs.thumb, { backgroundColor: '#1a1a1a' }]} />}
      <View style={vs.playBtn}><Text style={vs.playIcon}>▶</Text></View>
    </View>
  );
}

// ── Video post component ──────────────────────────────────────────────────────
// Only rendered when the post IS near-visible (controlled by PostCard below).
// Because VideoPost is conditionally mounted, useVideoPlayer() is only called
// for posts currently on or near the screen — not for every video in the feed.
function VideoPost({
  videoUrl,
  thumbnailUrl,
}: {
  videoUrl: string;
  thumbnailUrl: string | null;
}) {
  const [playing, setPlaying] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const player = useVideoPlayer({ uri: videoUrl }, (p: any) => { p.loop = false; });

  function handleTap() {
    setPlaying(true);
    player.play();
  }

  return (
    <View style={vs.wrap}>
      <VideoView
        style={[vs.thumb, playing ? vs.visible : vs.hidden]}
        player={player}
        contentFit="cover"
      />
      {/* Thumbnail overlay — hidden once user taps play */}
      {!playing && (
        <Pressable onPress={handleTap} style={[vs.thumbWrap, vs.overlayAbsolute]}>
          {thumbnailUrl
            ? <Image source={{ uri: thumbnailUrl }} style={vs.thumb} resizeMode="cover" />
            : <View style={[vs.thumb, { backgroundColor: '#1a1a1a' }]} />}
          <View style={vs.playBtn}><Text style={vs.playIcon}>▶</Text></View>
        </Pressable>
      )}
    </View>
  );
}
const vs = StyleSheet.create({
  wrap: { borderRadius: radii.md, overflow: 'hidden', marginTop: spacing.sm, backgroundColor: '#000', height: 220 },
  thumbWrap: { position: 'relative' },
  overlayAbsolute: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  thumb: { width: '100%', height: 220 },
  visible: { opacity: 1 },
  hidden: { opacity: 0 },
  playBtn: { position: 'absolute', top: '50%', left: '50%', marginTop: -24, marginLeft: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#fff', fontSize: 20, marginLeft: 4 },
});

// ── Post body with @mention highlighting ──────────────────────────────────────
function PostBody({ body, taggedUsers }: { body: string | null; taggedUsers: Author[] }) {
  if (!body) return null;
  if (!taggedUsers.length) return <Text style={ps.body}>{body}</Text>;

  const tagNames = taggedUsers.map(u => u.name);
  const parts: React.ReactNode[] = [];
  let rest = body;

  tagNames.forEach(name => {
    const idx = rest.indexOf(`@${name}`);
    if (idx !== -1) {
      if (idx > 0) parts.push(rest.slice(0, idx));
      parts.push(<Text key={name} style={ps.mention}>@{name}</Text>);
      rest = rest.slice(idx + name.length + 1);
    }
  });
  if (rest) parts.push(rest);

  return <Text style={ps.body}>{parts}</Text>;
}

// ── Post card (Facebook-style) ────────────────────────────────────────────────
function PostCard({ post, myId, isNearVisible, onLike, onComment, onShare, onShareToRoom, onDelete }: {
  post: CommunityPost;
  myId: string | null;
  isNearVisible: boolean;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onShareToRoom: () => void;
  onDelete: () => void;
}) {
  const heartAnim = useRef(new Animated.Value(1)).current;
  const [menuOpen, setMenuOpen] = useState(false);

  function animLike() {
    Animated.sequence([
      Animated.spring(heartAnim, { toValue: 1.35, useNativeDriver: true, tension: 140 }),
      Animated.spring(heartAnim, { toValue: 1, useNativeDriver: true, tension: 80 }),
    ]).start();
    onLike();
  }

  const isOwner = myId === post.author.userId;
  const hasTagged = (post.taggedUsers ?? []).length > 0;
  const tagLine = hasTagged
    ? `— with ${post.taggedUsers!.map(u => u.name).join(', ')}`
    : null;

  return (
    <View style={ps.card}>
      {/* Author row */}
      <View style={ps.header}>
        <Avatar url={post.author.avatarUrl} name={post.author.name} size={42} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
            <Text style={ps.authorName}>{post.author.name}</Text>
            {tagLine ? <Text style={ps.tagLine}>{tagLine}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Text style={ps.time}>{relTime(post.createdAt)}</Text>
            <Text style={ps.timeDot}>·</Text>
            <Ionicons name="earth-outline" size={11} color={colors.inkFaint} />
          </View>
        </View>
        {isOwner && (
          <Pressable style={ps.menuBtn} onPress={() => setMenuOpen(true)} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkSoft} />
          </Pressable>
        )}
      </View>

      {/* Body */}
      <PostBody body={post.body} taggedUsers={post.taggedUsers ?? []} />

      {/* Media */}
      {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={ps.image} resizeMode="cover" /> : null}
      {post.videoUrl ? (
        isNearVisible
          ? <VideoPost videoUrl={post.videoUrl} thumbnailUrl={post.videoThumbnailUrl ?? null} />
          : <VideoThumbnailPlaceholder thumbnailUrl={post.videoThumbnailUrl ?? null} />
      ) : null}

      {/* Reaction counts */}
      {(post.likeCount > 0 || post.commentCount > 0) && (
        <View style={ps.countsRow}>
          {post.likeCount > 0 && (
            <View style={ps.countItem}>
              <View style={ps.likeCircle}><Text style={{ fontSize: 9 }}>❤️</Text></View>
              <Text style={ps.countText}>{post.likeCount}</Text>
            </View>
          )}
          {post.commentCount > 0 && (
            <Text style={[ps.countText, { marginLeft: 'auto' }]}>{post.commentCount} comment{post.commentCount !== 1 ? 's' : ''}</Text>
          )}
        </View>
      )}

      {/* Action buttons bar */}
      <View style={ps.actionsDivider} />
      <View style={ps.actions}>
        <Pressable style={ps.actionBtn} onPress={animLike}>
          <Animated.View style={{ transform: [{ scale: heartAnim }] }}>
            <Ionicons name={post.liked ? 'heart' : 'heart-outline'} size={19} color={post.liked ? '#E05252' : colors.inkSoft} />
          </Animated.View>
          <Text style={[ps.actionText, post.liked && { color: '#E05252' }]}>Like</Text>
        </Pressable>
        <Pressable style={ps.actionBtn} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={18} color={colors.inkSoft} />
          <Text style={ps.actionText}>Comment</Text>
        </Pressable>
        <Pressable style={ps.actionBtn} onPress={onShareToRoom}>
          <Ionicons name="paper-plane-outline" size={18} color={colors.inkSoft} />
          <Text style={ps.actionText}>Send</Text>
        </Pressable>
        <Pressable style={ps.actionBtn} onPress={onShare}>
          <Ionicons name="share-outline" size={18} color={colors.inkSoft} />
          <Text style={ps.actionText}>Share</Text>
        </Pressable>
      </View>

      {/* Owner context menu */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={ps.menuOverlay} onPress={() => setMenuOpen(false)}>
          <View style={ps.menuCard}>
            <Text style={ps.menuTitle}>Post Options</Text>
            <Pressable style={ps.menuItem} onPress={() => { setMenuOpen(false); onDelete(); }}>
              <Text style={[ps.menuItemText, { color: colors.danger }]}>Delete Post</Text>
            </Pressable>
            <Pressable style={ps.menuItem} onPress={() => setMenuOpen(false)}>
              <Text style={ps.menuItemText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
const ps = StyleSheet.create({
  card: { backgroundColor: colors.white, marginBottom: 8, paddingTop: spacing.md, paddingBottom: 0, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  authorName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  tagLine: { fontSize: 13, color: colors.inkSoft, fontWeight: '400' },
  timeDot: { fontSize: 10, color: colors.inkFaint },
  time: { fontSize: 12, color: colors.inkFaint },
  menuBtn: { padding: 4, marginTop: 2 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22, marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  mention: { color: colors.olive, fontWeight: '600' },
  image: { width: '100%', height: 240, backgroundColor: colors.parchmentDark, marginBottom: 0 },
  countsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 8 },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCircle: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#E05252', alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 13, color: colors.inkFaint },
  actionsDivider: { height: 1, backgroundColor: colors.parchmentDark, marginHorizontal: spacing.lg },
  actions: { flexDirection: 'row', paddingHorizontal: spacing.sm, paddingVertical: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  actionText: { fontSize: 13, color: colors.inkSoft, fontWeight: '600' },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'flex-end', padding: spacing.lg },
  menuCard: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg, width: '100%', ...shadows.cardLg },
  menuTitle: { ...typography.subtitle, color: colors.ink, marginBottom: spacing.md },
  menuItem: { paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.parchmentDark },
  menuItemText: { fontSize: 16, color: colors.ink, fontWeight: '600', textAlign: 'center' },
});

// ── Share to room modal ────────────────────────────────────────────────────────
function ShareToRoomModal({ post, rooms, visible, onClose, onShared }: {
  post: CommunityPost | null;
  rooms: ChatRoom[];
  visible: boolean;
  onClose: () => void;
  onShared: () => void;
}) {
  const [note, setNote] = useState('');
  const [sharing, setSharing] = useState<string | null>(null);

  async function doShare(room: ChatRoom) {
    if (!post) return;
    setSharing(room.id);
    try {
      await sharePostToRoom(post.id, room.id, note.trim() || undefined);
      setNote('');
      onShared();
      Alert.alert('Shared!', `Post shared to ${room.type === 'group' ? (room.name ?? 'General') : (room.otherUser?.name ?? 'DM')}`);
      onClose();
    } catch {
      Alert.alert('Error', 'Could not share. Please try again.');
    } finally {
      setSharing(null);
    }
  }

  const roomName = (r: ChatRoom) =>
    r.type === 'group' ? `👥 ${r.name ?? 'General'}` : `💬 ${r.otherUser?.name ?? 'DM'}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.parchment }}>
        <View style={str.header}>
          <Text style={str.title}>Share to Chat</Text>
          <Pressable onPress={onClose}><Text style={str.close}>✕</Text></Pressable>
        </View>
        {post && (
          <View style={str.previewCard}>
            {post.body ? <Text style={str.previewBody} numberOfLines={2}>{post.body}</Text> : null}
            {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={str.previewImage} resizeMode="cover" /> : null}
          </View>
        )}
        <View style={str.noteWrap}>
          <TextInput
            style={str.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note (optional)…"
            placeholderTextColor={colors.inkFaint}
          />
        </View>
        <Text style={str.sectionLabel}>CHOOSE A ROOM</Text>
        <FlatList
          data={rooms}
          keyExtractor={r => r.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          renderItem={({ item: room }) => (
            <Pressable
              style={({ pressed }) => [str.roomRow, pressed && { opacity: 0.7 }]}
              onPress={() => doShare(room)}
              disabled={sharing === room.id}
            >
              <Text style={str.roomName}>{roomName(room)}</Text>
              {sharing === room.id
                ? <ActivityIndicator size="small" color={colors.olive} />
                : <Text style={str.roomArrow}>›</Text>}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={str.empty}>No chats yet. Start a DM from the Chats tab first.</Text>
          }
        />
      </View>
    </Modal>
  );
}
const str = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark, backgroundColor: colors.white },
  title: { ...typography.subtitle, color: colors.ink },
  close: { fontSize: 20, color: colors.inkFaint, padding: 4 },
  previewCard: { margin: spacing.lg, backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, ...shadows.subtle },
  previewBody: { fontSize: 14, color: colors.ink, lineHeight: 20, marginBottom: spacing.xs },
  previewImage: { width: '100%', height: 120, borderRadius: radii.sm },
  noteWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  noteInput: { backgroundColor: colors.white, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink, borderWidth: 1.5, borderColor: colors.parchmentDark },
  sectionLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  roomRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radii.md, marginBottom: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, ...shadows.subtle },
  roomName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.ink },
  roomArrow: { fontSize: 22, color: colors.inkFaint },
  empty: { textAlign: 'center', color: colors.inkFaint, paddingVertical: 24, fontSize: 14 },
});

// ── Comments bottom sheet ─────────────────────────────────────────────────────
function CommentsSheet({
  post, visible, onClose, onCommentAdded,
}: {
  post: CommunityPost | null;
  visible: boolean;
  onClose: () => void;
  onCommentAdded?: (postId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<PostComment | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible && post) {
      setLoading(true);
      getPostComments(post.id).then(c => { setComments(c); setLoading(false); }).catch(() => setLoading(false));
    }
  }, [visible, post?.id]);

  async function submit() {
    if (!text.trim() || !post) return;
    setSending(true);
    try {
      const c = await addPostComment(post.id, text.trim(), replyTo?.id);
      if (replyTo) {
        setComments(prev => prev.map(cc => cc.id === replyTo.id ? { ...cc, replies: [...cc.replies, c] } : cc));
      } else {
        setComments(prev => [c, ...prev]);
        // Notify parent so the comment count in the feed card increments
        onCommentAdded?.(post.id);
      }
      setText(''); setReplyTo(null);
    } catch { Alert.alert('Error', 'Could not post comment. Please try again.'); }
    finally { setSending(false); }
  }

  async function handleToggleCommentLike(postId: string, comment: PostComment, isReply: boolean, parentId?: string) {
    try {
      const { liked, likeCount } = await toggleCommentLike(postId, comment.id);
      setComments(prev => prev.map(c => {
        if (!isReply && c.id === comment.id) return { ...c, liked, likeCount };
        if (isReply && c.id === parentId) {
          return { ...c, replies: c.replies.map(r => r.id === comment.id ? { ...r, liked, likeCount } : r) };
        }
        return c;
      }));
    } catch {}
  }

  function renderComment(c: PostComment, isReply = false, parentId?: string) {
    return (
      <View key={c.id} style={[cs.row, isReply && cs.replyRow]}>
        <Avatar url={c.author.avatarUrl} name={c.author.name} size={isReply ? 28 : 34} />
        <View style={cs.bubble}>
          <Text style={cs.commentAuthor}>{c.author.name} <Text style={cs.commentTime}>{relTime(c.createdAt)}</Text></Text>
          <Text style={cs.commentBody}>{c.body}</Text>
          <View style={cs.commentActions}>
            <TouchableOpacity onPress={() => post && handleToggleCommentLike(post.id, c, isReply, parentId)}>
              <Text style={[cs.commentAction, c.liked && { color: '#E05252' }]}>♥ {c.likeCount > 0 ? c.likeCount : 'Like'}</Text>
            </TouchableOpacity>
            {!isReply && <TouchableOpacity onPress={() => setReplyTo(c)}><Text style={cs.commentAction}>Reply</Text></TouchableOpacity>}
          </View>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {/* 
        KeyboardAvoidingView behavior="padding" works on both iOS and Android here.
        We also apply paddingBottom = insets.bottom so the input row clears the
        Android system navigation bar (gesture or 3-button nav).
      */}
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.parchment }} behavior="padding">
        <View style={cs.header}>
          <Text style={cs.title}>Comments</Text>
          <Pressable onPress={onClose}><Text style={cs.closeBtn}>✕</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator color={colors.gold} style={{ marginTop: 32 }} /> : (
          <FlatList
            data={comments}
            keyExtractor={c => c.id}
            contentContainerStyle={{ padding: spacing.md }}
            renderItem={({ item: c }) => (
              <View>{renderComment(c)}{c.replies.map(r => renderComment(r, true, c.id))}</View>
            )}
            ListEmptyComponent={<Text style={cs.empty}>No comments yet. Be the first!</Text>}
          />
        )}
        {replyTo && (
          <View style={cs.replyBanner}>
            <Text style={cs.replyBannerText}>↩ Replying to {replyTo.author.name}</Text>
            <Pressable onPress={() => setReplyTo(null)}><Text style={cs.replyBannerClose}>✕</Text></Pressable>
          </View>
        )}
        {/* paddingBottom ensures input clears Android nav bar */}
        <View style={[cs.inputRow, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <TextInput style={cs.input} value={text} onChangeText={setText} placeholder="Write a comment…" placeholderTextColor={colors.inkFaint} multiline />
          <Pressable style={[cs.sendBtn, sending && { opacity: 0.6 }]} onPress={submit} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={cs.sendBtnText}>↑</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const cs = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark, backgroundColor: colors.white },
  title: { ...typography.subtitle, color: colors.ink },
  closeBtn: { fontSize: 20, color: colors.inkFaint, padding: 4 },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  replyRow: { marginLeft: 42, marginBottom: spacing.sm },
  bubble: { flex: 1, backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.sm, ...shadows.subtle },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: colors.ink },
  commentTime: { fontSize: 11, fontWeight: '400', color: colors.inkFaint },
  commentBody: { fontSize: 14, color: colors.ink, lineHeight: 20, marginTop: 3 },
  commentActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  commentAction: { fontSize: 12, color: colors.inkFaint, fontWeight: '600' },
  // Note: paddingBottom is applied dynamically (insets.bottom) — see JSX above
  inputRow: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md, paddingHorizontal: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.parchmentDark, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: colors.parchment, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink, maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  replyBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.parchment, borderTopWidth: 1, borderTopColor: colors.parchmentDark },
  replyBannerText: { fontSize: 12, color: colors.olive, fontWeight: '600' },
  replyBannerClose: { fontSize: 14, color: colors.inkFaint },
  empty: { textAlign: 'center', color: colors.inkFaint, paddingVertical: 24, fontSize: 14 },
});

// ── Create post modal (with @mention tagging) ─────────────────────────────────
function CreatePostModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (p: CommunityPost) => void }) {
  const [text, setText] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  // Tagging
  const [members, setMembers] = useState<Author[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<Author[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionFiltered, setMentionFiltered] = useState<Author[]>([]);

  useEffect(() => {
    if (visible) {
      getChurchMembers().then(setMembers).catch(() => {});
    } else {
      setText(''); setMediaUri(null); setMediaType(null); setThumbUri(null); setTaggedUsers([]); setShowMentions(false);
    }
  }, [visible]);

  function handleTextChange(v: string) {
    setText(v);
    const atIdx = v.lastIndexOf('@');
    if (atIdx !== -1 && (atIdx === 0 || v[atIdx - 1] === ' ' || v[atIdx - 1] === '\n')) {
      const query = v.slice(atIdx + 1).toLowerCase();
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setMentionFiltered(members.filter(m => m.name.toLowerCase().includes(query)).slice(0, 6));
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  }

  function selectMention(member: Author) {
    const atIdx = text.lastIndexOf('@');
    const newText = text.slice(0, atIdx) + `@${member.name} `;
    setText(newText);
    setTaggedUsers(prev => prev.find(u => u.userId === member.userId) ? prev : [...prev, member]);
    setShowMentions(false);
  }

  // Track the real MIME type from the picker so uploads don't get the wrong
  // content-type header (e.g. PNG files shouldn't be sent as image/jpeg).
  const [mediaMimeType, setMediaMimeType] = useState<string | null>(null);

  async function pickMedia() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setMediaUri(asset.uri);
      // Prefer the picker-reported MIME; fall back gracefully by type
      const mime = (asset as any).mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
      setMediaMimeType(mime);
      if (asset.type === 'video') {
        setMediaType('video');
        try { const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 }); setThumbUri(uri); } catch {}
      } else { setMediaType('image'); setThumbUri(null); }
    }
  }

  async function submit() {
    if (!text.trim() && !mediaUri) return;
    setUploading(true);
    try {
      let imageUrl: string | undefined, videoUrl: string | undefined, videoThumbnailUrl: string | undefined;
      if (mediaUri && mediaType === 'image') {
        const r = await uploadPostMedia(mediaUri, mediaMimeType ?? 'image/jpeg');
        imageUrl = r.url;
      } else if (mediaUri && mediaType === 'video') {
        const r = await uploadPostMedia(mediaUri, mediaMimeType ?? 'video/mp4');
        videoUrl = r.url; videoThumbnailUrl = r.thumbnailUrl;
      }
      const post = await createPost({
        body: text.trim() || undefined, imageUrl, videoUrl, videoThumbnailUrl,
        taggedUserIds: taggedUsers.map(u => u.userId),
      });
      onCreated(post);
      onClose();
    } catch { Alert.alert('Error', 'Could not create post. Please try again.'); }
    finally { setUploading(false); }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.parchment }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={cpm.header}>
          <Pressable onPress={onClose}><Text style={cpm.cancel}>Cancel</Text></Pressable>
          <Text style={cpm.title}>New Post</Text>
          <Pressable style={[cpm.postBtn, uploading && { opacity: 0.6 }]} onPress={submit} disabled={uploading}>
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={cpm.postBtnText}>Post</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
          <TextInput style={cpm.textInput} value={text} onChangeText={handleTextChange}
            placeholder="What's on your heart today? Use @name to tag someone." placeholderTextColor={colors.inkFaint}
            multiline autoFocus textAlignVertical="top" />
          {/* @mention suggestion list */}
          {showMentions && mentionFiltered.length > 0 && (
            <View style={cpm.mentionList}>
              {mentionFiltered.map(m => (
                <Pressable key={m.userId} style={cpm.mentionRow} onPress={() => selectMention(m)}>
                  <Avatar url={m.avatarUrl} name={m.name} size={28} />
                  <Text style={cpm.mentionName}>{m.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {/* Tagged chips */}
          {taggedUsers.length > 0 && (
            <View style={cpm.taggedRow}>
              {taggedUsers.map(u => (
                <Pressable key={u.userId} style={cpm.tagChip} onPress={() => setTaggedUsers(prev => prev.filter(x => x.userId !== u.userId))}>
                  <Text style={cpm.tagChipText}>@{u.name} ×</Text>
                </Pressable>
              ))}
            </View>
          )}
          {mediaUri && mediaType === 'image' && <Image source={{ uri: mediaUri }} style={cpm.preview} resizeMode="cover" />}
          {mediaUri && mediaType === 'video' && (
            <View style={cpm.preview}>
              {thumbUri ? <Image source={{ uri: thumbUri }} style={{ flex: 1, borderRadius: radii.md }} resizeMode="cover" /> : <View style={[cpm.preview, { backgroundColor: '#111' }]} />}
              <View style={vs.playBtn}><Text style={vs.playIcon}>▶</Text></View>
            </View>
          )}
          <View style={cpm.toolbar}>
            <Pressable style={cpm.toolBtn} onPress={pickMedia}>
              <Ionicons name="image-outline" size={20} color={colors.inkSoft} />
              <Text style={cpm.toolLabel}>Photo/Video</Text>
            </Pressable>
            {mediaUri && (
              <Pressable style={cpm.toolBtn} onPress={() => { setMediaUri(null); setMediaType(null); setThumbUri(null); }}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[cpm.toolLabel, { color: colors.danger }]}>Remove</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const cpm = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark, backgroundColor: colors.white },
  title: { ...typography.subtitle, color: colors.ink },
  cancel: { color: colors.inkSoft, fontSize: 15 },
  postBtn: { backgroundColor: colors.olive, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 7 },
  postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  textInput: { fontSize: 16, color: colors.ink, lineHeight: 24, minHeight: 100, marginBottom: spacing.md },
  preview: { width: '100%', height: 200, borderRadius: radii.md, backgroundColor: colors.parchmentDark, marginBottom: spacing.md, position: 'relative' },
  toolbar: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.parchmentDark },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: spacing.sm },
  toolLabel: { fontSize: 13, color: colors.inkSoft, fontWeight: '600' },
  mentionList: { backgroundColor: colors.white, borderRadius: radii.md, borderWidth: 1, borderColor: colors.parchmentDark, marginBottom: spacing.sm, overflow: 'hidden' },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark },
  mentionName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  taggedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  tagChip: { backgroundColor: colors.oliveFaint ?? colors.olive + '20', borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: spacing.sm },
  tagChipText: { fontSize: 12, color: colors.olive, fontWeight: '600' },
});

// ── PIN gate ──────────────────────────────────────────────────────────────────
function PinGate({ onVerified }: { onVerified: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function check() {
    if (pin.length < 4) { setError('PIN must be 4–8 digits'); return; }
    setChecking(true);
    try {
      const valid = await validatePin(pin);
      if (valid) { onVerified(); }
      else { setError('Incorrect PIN. Try again.'); setPin(''); }
    } catch { setError('Could not verify PIN. Check connection.'); }
    finally { setChecking(false); }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','⌫','0','✓'];
  return (
    <View style={pg.bg}>
      <LinearGradient colors={['#2E3A1F','#3E4A2F']} style={pg.container}>
        <Text style={pg.lock}>🔒</Text>
        <Text style={pg.title}>Olive Chat</Text>
        <Text style={pg.subtitle}>Enter your PIN to continue</Text>
        <View style={pg.dots}>
          {[0,1,2,3].map(i => <View key={i} style={[pg.dot, pin.length > i && pg.dotFilled]} />)}
        </View>
        {error ? <Text style={pg.error}>{error}</Text> : null}
        <View style={pg.keypad}>
          {keys.map(k => (
            <Pressable key={k} style={({ pressed }) => [pg.key, pressed && pg.keyPressed]} onPress={() => {
              if (k === '⌫') { setPin(p => p.slice(0,-1)); setError(''); }
              else if (k === '✓') { check(); }
              else if (pin.length < 8) { setPin(p => p + k); setError(''); }
            }}>
              {checking && k === '✓'
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={[pg.keyText, k === '✓' && { color: colors.goldLight }]}>{k}</Text>}
            </Pressable>
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}
const pg = StyleSheet.create({
  bg: { ...StyleSheet.absoluteFill, zIndex: 100 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  lock: { fontSize: 48, marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 32 },
  dots: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: colors.goldLight, borderColor: colors.goldLight },
  error: { color: '#FF6B6B', fontSize: 13, marginBottom: 16 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12, justifyContent: 'center' },
  key: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: 'rgba(255,255,255,0.25)' },
  keyText: { fontSize: 22, fontWeight: '600', color: '#fff' },
});

// ── Profile tab ───────────────────────────────────────────────────────────────
function ProfileTab({ profile, profileError, onReload }: { profile: UserProfile | null; profileError: boolean; onReload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.displayName ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [dob, setDob] = useState(profile?.dateOfBirth ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pinModal, setPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [settingPin, setSettingPin] = useState(false);
  const [pinSet, setPinSet] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.displayName ?? ''); setBio(profile.bio ?? ''); setDob(profile.dateOfBirth ?? '');
      getPinStatus().then(setPinSet).catch(() => {});
    }
  }, [profile]);

  async function pickAndUpload(type: 'avatar' | 'cover') {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    try {
      if (type === 'avatar') await uploadAvatar(res.assets[0].uri);
      else await uploadCover(res.assets[0].uri);
      onReload();
    } catch { Alert.alert('Upload error', 'Upload failed. Please try again.'); }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try { await updateProfile({ displayName: name.trim(), bio: bio.trim(), dateOfBirth: dob || undefined }); onReload(); setEditing(false); }
    catch { Alert.alert('Error', 'Could not save profile. Please try again.'); }
    finally { setSavingProfile(false); }
  }

  async function handleSetPin() {
    if (!newPin.trim()) { await setPin(null); setPinSet(false); setPinModal(false); setNewPin(''); return; }
    if (!/^\d{4,8}$/.test(newPin)) { Alert.alert('Invalid PIN', 'PIN must be 4–8 digits'); return; }
    setSettingPin(true);
    try { await setPin(newPin); setPinSet(true); setPinModal(false); setNewPin(''); Alert.alert('PIN set', 'Your Olive Chat PIN has been saved.'); }
    catch { Alert.alert('Error', 'Could not save PIN. Please try again.'); }
    finally { setSettingPin(false); }
  }

  if (profileError) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
      <Ionicons name="person-circle-outline" size={56} color={colors.inkFaint} />
      <Text style={{ ...typography.subtitle, color: colors.ink, marginTop: 16, marginBottom: 8 }}>Couldn't load profile</Text>
      <Text style={{ fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginBottom: 24 }}>Check your connection and try again.</Text>
      <Pressable style={{ backgroundColor: colors.olive, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }} onPress={onReload}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
      </Pressable>
    </View>
  );
  if (!profile) return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Cover skeleton */}
      <SkeletonBox style={{ height: 160, borderRadius: 0 }} />
      {/* Avatar + edit button row */}
      <View style={{ paddingHorizontal: spacing.lg, marginTop: -40, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <SkeletonBox style={{ width: 84, height: 84, borderRadius: 42 }} />
        <SkeletonBox style={{ width: 100, height: 34, borderRadius: 20 }} />
      </View>
      {/* Info skeleton */}
      <View style={{ padding: spacing.lg, backgroundColor: colors.white }}>
        <SkeletonBox style={{ height: 20, width: '60%', marginBottom: 10 }} />
        <SkeletonBox style={{ height: 13, width: '80%', marginBottom: 6 }} />
        <SkeletonBox style={{ height: 13, width: '50%', marginBottom: 6 }} />
      </View>
      {/* Section skeleton */}
      <View style={{ margin: spacing.lg, backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg }}>
        <SkeletonBox style={{ height: 12, width: '40%', marginBottom: 12 }} />
        <SkeletonBox style={{ height: 13, width: '85%', marginBottom: 8 }} />
        <SkeletonBox style={{ height: 36, borderRadius: radii.pill, marginTop: spacing.sm }} />
      </View>
    </ScrollView>
  );

  const age = ageFromDob(profile.dateOfBirth);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Cover */}
      <Pressable onPress={() => pickAndUpload('cover')}>
        <View style={pf.cover}>
          {profile.coverUrl
            ? <Image source={{ uri: profile.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <LinearGradient colors={['#3E4A2F','#8A6A10']} style={StyleSheet.absoluteFill} />}
          <View style={pf.coverEdit}><Text style={pf.coverEditText}>✎ Edit cover</Text></View>
        </View>
      </Pressable>
      {/* Avatar */}
      <View style={pf.avatarRow}>
        <Pressable onPress={() => pickAndUpload('avatar')}>
          <View style={pf.avatarWrap}>
            <Avatar url={profile.avatarUrl} name={profile.displayName ?? profile.email ?? '?'} size={80} />
            <View style={pf.avatarEditBadge}><Text style={{ color: '#fff', fontSize: 12 }}>✎</Text></View>
          </View>
        </Pressable>
        {!editing
          ? <Pressable style={pf.editBtn} onPress={() => setEditing(true)}><Text style={pf.editBtnText}>Edit Profile</Text></Pressable>
          : <Pressable style={[pf.editBtn, { backgroundColor: colors.olive }]} onPress={saveProfile} disabled={savingProfile}>
              {savingProfile ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[pf.editBtnText, { color: '#fff' }]}>Save</Text>}
            </Pressable>}
      </View>
      <View style={pf.infoWrap}>
        {editing ? (
          <>
            <Text style={pf.fieldLabel}>DISPLAY NAME</Text>
            <TextInput style={pf.fieldInput} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.inkFaint} />
            <Text style={pf.fieldLabel}>BIO</Text>
            <TextInput style={[pf.fieldInput, { minHeight: 70 }]} value={bio} onChangeText={setBio} placeholder="A little about you…" placeholderTextColor={colors.inkFaint} multiline textAlignVertical="top" />
            <Text style={pf.fieldLabel}>DATE OF BIRTH (YYYY-MM-DD)</Text>
            <TextInput style={pf.fieldInput} value={dob} onChangeText={setDob} placeholder="1990-01-01" placeholderTextColor={colors.inkFaint} />
          </>
        ) : (
          <>
            <Text style={pf.displayName}>{profile.displayName ?? profile.email?.split('@')[0]}</Text>
            {profile.bio ? <Text style={pf.bioText}>{profile.bio}</Text> : null}
            {profile.email ? <Text style={pf.metaText}>📧 {profile.email}</Text> : null}
            {profile.dateOfBirth ? (
              <Text style={pf.metaText}>
                🎂 {profile.dateOfBirth}{age !== null ? `  ·  ${age} years old` : ''}
              </Text>
            ) : null}
          </>
        )}
      </View>
      {/* Security */}
      <View style={pf.section}>
        <Text style={pf.sectionTitle}>OLIVE CHAT LOCK</Text>
        <Text style={pf.sectionDesc}>Set a PIN to protect access to Olive Chat on this device.</Text>
        <Pressable style={pf.pinBtn} onPress={() => setPinModal(true)}>
          <Text style={pf.pinBtnText}>{pinSet ? '🔒 Change / Remove PIN' : '🔓 Set PIN'}</Text>
        </Pressable>
      </View>
      <Modal visible={pinModal} animationType="fade" transparent onRequestClose={() => setPinModal(false)}>
        <View style={pf.pinOverlay}>
          <View style={pf.pinCard}>
            <Text style={pf.pinCardTitle}>{pinSet ? 'Change PIN' : 'Set PIN'}</Text>
            <Text style={pf.pinCardDesc}>Enter 4–8 digits. Leave blank to remove the PIN lock.</Text>
            <TextInput style={pf.pinInput} value={newPin} onChangeText={setNewPin} placeholder="Enter new PIN" placeholderTextColor={colors.inkFaint} keyboardType="number-pad" secureTextEntry maxLength={8} />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <Pressable style={[pf.pinAction, { backgroundColor: colors.parchmentDark }]} onPress={() => { setPinModal(false); setNewPin(''); }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable style={[pf.pinAction, { flex: 1, backgroundColor: colors.olive }]} onPress={handleSetPin} disabled={settingPin}>
                {settingPin ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>Save PIN</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
const pf = StyleSheet.create({
  cover: { height: 160, backgroundColor: colors.oliveDark, position: 'relative', overflow: 'hidden' },
  coverEdit: { position: 'absolute', bottom: 10, right: 12, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  coverEditText: { color: '#fff', fontSize: 12 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: -40, marginBottom: spacing.sm },
  avatarWrap: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: colors.white, backgroundColor: colors.white, position: 'relative', ...shadows.card },
  avatarEditBadge: { position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  editBtn: { borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1.5, borderColor: colors.oliveDark, alignSelf: 'flex-end', minWidth: 100, alignItems: 'center' },
  editBtnText: { color: colors.oliveDark, fontWeight: '700', fontSize: 13 },
  infoWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, backgroundColor: colors.white },
  displayName: { fontSize: 22, fontWeight: '700', color: colors.ink, letterSpacing: -0.3, marginBottom: 6 },
  bioText: { fontSize: 14, color: colors.inkSoft, lineHeight: 20, marginBottom: 6 },
  metaText: { fontSize: 13, color: colors.inkFaint, marginBottom: 3 },
  fieldLabel: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: spacing.xs, marginTop: spacing.sm },
  fieldInput: { backgroundColor: colors.parchment, borderWidth: 1.5, borderColor: colors.parchmentDark, borderRadius: radii.md, padding: spacing.md, fontSize: 15, color: colors.ink, marginBottom: spacing.sm },
  section: { margin: spacing.lg, backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg, ...shadows.subtle },
  sectionTitle: { ...typography.micro, color: colors.inkFaint, letterSpacing: 2, marginBottom: spacing.xs },
  sectionDesc: { fontSize: 13, color: colors.inkSoft, lineHeight: 20, marginBottom: spacing.md },
  pinBtn: { backgroundColor: colors.parchment, borderRadius: radii.md, padding: spacing.md, alignItems: 'center', borderWidth: 1.5, borderColor: colors.parchmentDark },
  pinBtnText: { fontSize: 14, fontWeight: '600', color: colors.oliveDark },
  pinOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  pinCard: { backgroundColor: colors.white, borderRadius: radii.xl, padding: spacing.lg, width: '100%', ...shadows.cardLg },
  pinCardTitle: { ...typography.subtitle, color: colors.ink, marginBottom: spacing.xs },
  pinCardDesc: { fontSize: 13, color: colors.inkSoft, marginBottom: spacing.md, lineHeight: 18 },
  pinInput: { backgroundColor: colors.parchment, borderWidth: 1.5, borderColor: colors.parchmentDark, borderRadius: radii.md, padding: spacing.md, fontSize: 22, letterSpacing: 8, color: colors.ink, textAlign: 'center' },
  pinAction: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md, borderRadius: radii.md },
});

// ── Notifications tab ─────────────────────────────────────────────────────────
function NotificationsTab({ userId }: { userId: string | null }) {
  const [notifs, setNotifs] = useState<CommunityNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getNotifications()
      .then(n => { setNotifs(n); setLoading(false); })
      .catch(() => setLoading(false));
    // Mark all read after 2s
    const t = setTimeout(() => markNotificationsRead().catch(() => {}), 2000);
    return () => clearTimeout(t);
  }, [userId]);

  function notifIcon(type: CommunityNotification['type']) {
    switch (type) {
      case 'post_like': return '❤️';
      case 'comment_like': return '❤️';
      case 'comment': return '💬';
      case 'reply': return '↩️';
      case 'dm_message': return '✉️';
      case 'new_post': return '🌿';
      default: return '🔔';
    }
  }

  function notifText(n: CommunityNotification) {
    switch (n.type) {
      case 'post_like': return `${n.actor.name} liked your post`;
      case 'comment_like': return `${n.actor.name} liked your comment`;
      case 'comment': return `${n.actor.name} commented on your post`;
      case 'reply': return `${n.actor.name} replied to your comment`;
      case 'dm_message': return `${n.actor.name} sent you a message`;
      case 'new_post': return `${n.actor.name} posted something new`;
      default: return `New activity from ${n.actor.name}`;
    }
  }

  if (loading) return (
    <FlatList
      data={[1,2,3,4,5]}
      keyExtractor={i => String(i)}
      renderItem={() => <NotifSkeleton />}
      contentContainerStyle={{ paddingTop: 8 }}
    />
  );

  return (
    <FlatList
      data={notifs}
      keyExtractor={n => n.id}
      contentContainerStyle={{ paddingBottom: 80 }}
      renderItem={({ item: n }) => (
        <View style={[nt.row, !n.isRead && nt.rowUnread]}>
          <View style={nt.iconWrap}>
            <Avatar url={n.actor.avatarUrl} name={n.actor.name} size={42} />
            <Text style={nt.typeIcon}>{notifIcon(n.type)}</Text>
          </View>
          <View style={nt.content}>
            <Text style={nt.text}>{notifText(n)}</Text>
            <Text style={nt.time}>{relTime(n.createdAt)}</Text>
          </View>
          {!n.isRead && <View style={nt.unreadDot} />}
        </View>
      )}
      ListEmptyComponent={
        <View style={nt.empty}>
          <Text style={nt.emptyIcon}>🔔</Text>
          <Text style={nt.emptyTitle}>No notifications yet</Text>
          <Text style={nt.emptyDesc}>When someone likes or comments on your posts, it'll show up here.</Text>
        </View>
      }
    />
  );
}
const nt = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark, backgroundColor: colors.white, gap: spacing.md },
  rowUnread: { backgroundColor: '#F0F7EB' },
  iconWrap: { position: 'relative' },
  typeIcon: { position: 'absolute', bottom: -4, right: -4, fontSize: 14, backgroundColor: colors.white, borderRadius: 10, overflow: 'hidden' },
  content: { flex: 1 },
  text: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  time: { fontSize: 12, color: colors.inkFaint, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.olive },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  emptyDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: 'center', lineHeight: 22 },
});

// ── Chats tab room row ────────────────────────────────────────────────────────
function RoomRow({ room, onPress }: { room: ChatRoom; onPress: () => void }) {
  const name = room.type === 'group' ? (room.name ?? 'General') : (room.otherUser?.name ?? 'Member');
  const avatarUrl = room.type === 'dm' ? (room.otherUser?.avatarUrl ?? null) : null;
  return (
    <Pressable style={({ pressed }) => [rr.row, pressed && { backgroundColor: colors.parchment }]} onPress={onPress}>
      <Avatar url={avatarUrl} name={name} size={48} />
      <View style={rr.info}>
        <View style={rr.topRow}>
          <Text style={rr.name} numberOfLines={1}>{room.type === 'group' ? '👥 ' : ''}{name}</Text>
          {room.lastMessage && <Text style={rr.time}>{relTime(room.lastMessage.createdAt)}</Text>}
        </View>
        <Text style={rr.preview} numberOfLines={1}>{room.lastMessage?.body ?? 'No messages yet'}</Text>
      </View>
      {room.unreadCount > 0 && (
        <View style={rr.badge}><Text style={rr.badgeText}>{room.unreadCount > 99 ? '99+' : room.unreadCount}</Text></View>
      )}
    </Pressable>
  );
}
const rr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.parchmentDark, gap: spacing.md, backgroundColor: colors.white },
  info: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  name: { ...typography.subtitle, color: colors.ink, fontSize: 15, flex: 1 },
  time: { fontSize: 11, color: colors.inkFaint },
  preview: { fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Main screen
// ═══════════════════════════════════════════════════════════════════════════════
export default function OliveChatScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();

  const [tab, setTab] = useState<Tab>('feed');
  const [pinLocked, setPinLocked] = useState(false);
  const [pinChecked, setPinChecked] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [notMember, setNotMember] = useState(false);
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [messageRequests, setMessageRequests] = useState<MessageRequest[]>([]);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  // Viewability — track which feed indices are currently on-screen
  const visibleIndicesRef = useRef<Set<number>>(new Set());
  const [visibleIndicesSnap, setVisibleIndicesSnap] = useState<Set<number>>(new Set());
  // viewabilityConfig MUST be a stable ref (never recreated) — React Native throws if it changes.
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 20 });
  // onViewableItemsChanged MUST be a stable callback via useCallback (not useRef(...).current) —
  // passing a ref's .current value can cross the null↔function boundary on remount and triggers
  // "Changing onViewableItemsChanged nullability on the fly is not supported".
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const s = new Set(viewableItems.map(v => v.index ?? -1).filter(i => i >= 0));
    visibleIndicesRef.current = s;
    setVisibleIndicesSnap(new Set(s));
  }, []);
  const [sharePost, setSharePost] = useState<CommunityPost | null>(null);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Pending realtime posts — queued here instead of auto-prepended so the
  // user sees a "N new posts" banner they can tap rather than having the feed
  // jump while they're reading.
  const [pendingPosts, setPendingPosts] = useState<CommunityPost[]>([]);
  const feedListRef = useRef<import('react-native').FlatList<CommunityPost> | null>(null);

  // Real-time unsubscribe refs
  const timelineUnsubRef = useRef<(() => void) | null>(null);
  const notifUnsubRef = useRef<(() => void) | null>(null);
  const reqUnsubRef = useRef<(() => void) | null>(null);
  // Guard: after the first focus loads everything, skip the heavy reload on
  // subsequent focuses. Real-time subscriptions keep the feed/rooms fresh.
  const hasLoadedRef = useRef(false);
  const PROFILE_CACHE_KEY = 'olivechat.profile.v1';
  const PIN_CACHE_KEY = 'olivechat.pinActive.v1';

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      try {
        // ── Always: resolve user identity ────────────────────────────────────
        const { data: { user } } = await supabase.auth.getUser();
        if (active && user) setMyUserId(user.id);

        // ── Always: check PIN (security check every focus) ───────────────────
        // If getPinStatus() throws (network error), fall back to the cached
        // value from AsyncStorage so a brief offline period doesn't unlock the
        // app for users who have set a PIN.
        try {
          const pinActive = await getPinStatus();
          if (active) { setPinLocked(pinActive); setPinChecked(true); }
          // Persist so we can restore on error
          AsyncStorage.setItem(PIN_CACHE_KEY, JSON.stringify(pinActive)).catch(() => {});
        } catch {
          // Network error — restore from cache so PIN is not silently cleared
          try {
            const cached = await AsyncStorage.getItem(PIN_CACHE_KEY);
            const pinActive = cached ? JSON.parse(cached) : false;
            if (active) { setPinLocked(pinActive); setPinChecked(true); }
          } catch {
            if (active) setPinChecked(true);
          }
        }

        // ── Skip heavy data reload on subsequent focuses ─────────────────────
        // Real-time subscriptions (timeline, notifications, requests) keep
        // data fresh. Only load once per mount cycle.
        if (hasLoadedRef.current) return;
        hasLoadedRef.current = true;

        // ── Profile: serve from AsyncStorage cache immediately, refresh bg ───
        try {
          const cached = await AsyncStorage.getItem(PROFILE_CACHE_KEY);
          if (cached && active) {
            setProfile(JSON.parse(cached));
            setProfileError(false);
          }
        } catch {}

        // Fresh profile fetch with extended timeout (15 s to handle cold starts)
        getMyProfile().then(async p => {
          if (!active) return;
          setProfile(p); setProfileError(false);
          try { await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(p)); } catch {}
        }).catch(() => {
          // Only show error if we have no cached profile to display
          if (active) setProfileError(prev => {
            const hasCached = profile !== null;
            return hasCached ? false : true;
          });
        });

        // ── Feed + rooms: initial load ────────────────────────────────────────
        try {
          const [feed, r] = await Promise.all([getTimeline(), getRooms()]);
          if (active) {
            setLoadError(null);
            setPosts(feed);
            setLoadingFeed(false);
            setRooms(r);
            setLoadingRooms(false);
          }
        } catch (fetchErr: any) {
          if (active) setLoadError(fetchErr?.message ?? 'Could not connect to the server.');
        }

        // ── Notifications unread count ────────────────────────────────────────
        getNotifications().then(notifs => {
          if (active) setUnreadNotifCount(notifs.filter(n => !n.isRead).length);
        }).catch(() => {});

        // ── Real-time subscriptions (set up once per mount) ──────────────────
        if (active && !timelineUnsubRef.current) {
          timelineUnsubRef.current = subscribeToTimeline(newPost => {
            // Queue into pending rather than auto-prepending so the user sees a
            // "N new posts" banner and the feed doesn't jump while they scroll.
            // Own posts are added directly via onCreated, skip them here.
            setPosts(current => {
              if (current.find(p => p.id === newPost.id)) return current; // dedupe
              return current; // don't auto-insert
            });
            setPendingPosts(prev => {
              if (prev.find(p => p.id === newPost.id)) return prev;
              return [newPost, ...prev];
            });
          });
        }
        if (active && user && !notifUnsubRef.current) {
          notifUnsubRef.current = subscribeToNotifications(user.id, () => {
            setUnreadNotifCount(c => c + 1);
          });
        }

        // ── Message requests ──────────────────────────────────────────────────
        try {
          const reqs = await getMessageRequests();
          if (active) setMessageRequests(reqs.filter(r => r.status === 'pending'));
        } catch {}
        if (active && user && !reqUnsubRef.current) {
          reqUnsubRef.current = subscribeToMessageRequests(user.id, () => {
            getMessageRequests().then(r => setMessageRequests(r.filter(x => x.status === 'pending'))).catch(() => {});
          });
        }

      } catch (e: any) {
        if ((e as any)?.message?.includes('church') || (e as any)?.message?.includes('Join a church')) {
          if (active) { setNotMember(true); setLoadingFeed(false); setLoadingRooms(false); setPinChecked(true); }
        } else {
          if (active) {
            setLoadError('Could not connect to the server.');
            setPinChecked(true); // CRITICAL: always unblock the loading state
            setProfileError(profile === null); // only show error if no cached profile
          }
        }
      }
    })();
    return () => {
      active = false;
      // Don't unsubscribe on blur — keep realtime active while screen is mounted
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));

  // Clean up realtime on unmount
  useEffect(() => {
    return () => {
      timelineUnsubRef.current?.();
      notifUnsubRef.current?.();
      reqUnsubRef.current?.();
    };
  }, []);

  // Auto-retry silently when server is unreachable — keeps skeleton visible
  useEffect(() => {
    if (!loadError) return;
    const timer = setInterval(() => retryLoad(), 15_000);
    return () => clearInterval(timer);
  }, [loadError]);

  async function retryLoad() {
    setRetrying(true);
    // Re-show skeletons so the user sees loading state while retrying
    setLoadingFeed(true);
    setLoadingRooms(true);
    setLoadError(null);
    try {
      const [feed, r] = await Promise.all([getTimeline(), getRooms()]);
      setPosts(feed); setRooms(r);
      setLoadingFeed(false);
      setLoadingRooms(false);
    } catch (e: any) {
      // Leave loadingFeed/loadingRooms true — skeletons stay until server responds
      setLoadError(e?.message ?? 'Could not connect to the server.');
    }
    setRetrying(false);
  }

  async function refreshFeed() {
    setRefreshing(true);
    try { const feed = await getTimeline(); setPosts(feed); setLoadError(null); } catch (e: any) {
      setLoadError(e?.message ?? 'Could not connect to the server.');
    }
    setRefreshing(false);
  }

  async function refreshRooms() {
    try { const r = await getRooms(); setRooms(r); setLoadError(null); } catch (e: any) {
      setLoadError(e?.message ?? 'Could not connect to the server.');
    }
  }

  async function handleRespondToRequest(req: MessageRequest, action: 'accept' | 'reject' | 'block') {
    if (action === 'block') {
      Alert.alert(
        'Block this person?',
        `${req.fromUser.name} won't be able to message you. You can unblock them later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block', style: 'destructive',
            onPress: async () => {
              setRespondingId(req.id);
              try {
                await respondToRequest(req.id, 'block');
                setMessageRequests(prev => {
                  const remaining = prev.filter(r => r.id !== req.id);
                  if (remaining.length === 0) setShowRequestsModal(false);
                  return remaining;
                });
              } catch { Alert.alert('Error', 'Could not block user. Please try again.'); }
              setRespondingId(null);
            },
          },
        ]
      );
      return;
    }
    setRespondingId(req.id);
    try {
      await respondToRequest(req.id, action);
      setMessageRequests(prev => {
        const remaining = prev.filter(r => r.id !== req.id);
        if (remaining.length === 0) setShowRequestsModal(false);
        return remaining;
      });
      if (action === 'accept' && req.roomId) {
        setShowRequestsModal(false);
        navigation.navigate('ChatRoom' as any, {
          roomId: req.roomId,
          roomName: req.fromUser.name,
        });
      }
    } catch { Alert.alert('Error', 'Could not respond to request. Please try again.'); }
    setRespondingId(null);
  }

  async function handleLike(post: CommunityPost) {
    try {
      const { liked, likeCount } = await togglePostLike(post.id);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, liked, likeCount } : p));
    } catch {}
  }

  async function handleNativeShare(post: CommunityPost) {
    try {
      const msg = post.body ?? (post.imageUrl ? '[Image]' : '[Video]');
      await Share.share({ message: `${post.author.name}: ${msg}`, url: post.imageUrl ?? post.videoUrl ?? undefined });
    } catch {}
  }

  async function handleDeletePost(post: CommunityPost) {
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(post.id);
            setPosts(prev => prev.filter(p => p.id !== post.id));
          } catch { Alert.alert('Error', 'Could not delete post. Please try again.'); }
        },
      },
    ]);
  }

  if (!pinChecked) return (
    <View style={{ flex: 1 }}>
      <OliveChatSplash onFinish={() => {}} />
    </View>
  );
  if (pinLocked) return <PinGate onVerified={() => { setPinLocked(false); setShowSplash(false); }} />;

  if (notMember) return (
    <View style={{ flex: 1, backgroundColor: colors.parchment, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
      <Text style={{ fontSize: 48, marginBottom: 20 }}>⛪</Text>
      <Text style={{ ...typography.title, color: colors.ink, textAlign: 'center', marginBottom: 12 }}>Join a Church First</Text>
      <Text style={{ ...typography.body, color: colors.inkSoft, textAlign: 'center', lineHeight: 22 }}>
        You need to select your church in the Bulletin section before you can access Olive Chat.
      </Text>
    </View>
  );

  const TABS: { key: Tab; ionIcon: string; activeIonIcon: string; badge?: number }[] = [
    { key: 'feed',          ionIcon: 'leaf-outline',                 activeIonIcon: 'leaf' },
    { key: 'chats',         ionIcon: 'chatbubble-ellipses-outline',  activeIonIcon: 'chatbubble-ellipses', badge: messageRequests.length },
    { key: 'notifications', ionIcon: 'notifications-outline',        activeIonIcon: 'notifications',       badge: unreadNotifCount },
    { key: 'profile',       ionIcon: 'person-outline',               activeIonIcon: 'person' },
  ];

  const pendingRequestCount = messageRequests.length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.parchment }}>
      {/* Splash — shown once per session after PIN is cleared */}
      {pinChecked && !pinLocked && showSplash && (
        <OliveChatSplash onFinish={() => setShowSplash(false)} />
      )}

      {/* Header */}
      <LinearGradient colors={['#2E3A1F','#3E4A2F','#5B6B45']} style={[main.header, { paddingTop: spacing.sm + insets.top }]}>
        <View style={main.headerInner}>
          <Text style={main.headerTitle}>🫒 Olive Chat</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            {tab === 'chats' && (
              <Pressable style={main.headerIconBtn} onPress={() => navigation.navigate('CommunityMembers' as any)} hitSlop={8}>
                <Ionicons name="create-outline" size={22} color="#fff" />
              </Pressable>
            )}
            {tab === 'feed' && (
              <Pressable style={main.headerIconBtn} onPress={() => setShowCreate(true)} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={22} color="#fff" />
              </Pressable>
            )}
          </View>
        </View>
        {/* Tab bar — icons only, no text labels */}
        <View style={main.tabBar}>
          {TABS.map(t => {
            const isActive = tab === t.key;
            const badge = t.badge ?? 0;
            return (
              <Pressable
                key={t.key}
                style={[main.tabItem, isActive && main.tabItemActive]}
                onPress={() => {
                  setTab(t.key);
                  if (t.key === 'notifications') {
                    setUnreadNotifCount(0);
                    markNotificationsRead().catch(() => {});
                  }
                }}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons
                    name={isActive ? t.activeIonIcon as any : t.ionIcon as any}
                    size={22}
                    color={isActive ? '#fff' : 'rgba(255,255,255,0.55)'}
                  />
                  {badge > 0 && (
                    <View style={main.notifBadge}>
                      <Text style={main.notifBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </LinearGradient>

      {/* Feed */}
      {tab === 'feed' && (
        (loadingFeed || (loadError != null && posts.length === 0))
          ? <FlatList key="feed-skeleton" data={[1,2,3]} keyExtractor={i => String(i)} renderItem={() => <PostSkeleton />} contentContainerStyle={{ paddingTop: 8 }} />
          : (
            <>
            {/* "N new posts" banner — tapping merges pending into feed & scrolls to top */}
            {pendingPosts.length > 0 && (
              <Pressable
                style={comp.newPostsBanner}
                onPress={() => {
                  setPosts(prev => {
                    const merged = [...pendingPosts.filter(p => !prev.find(pp => pp.id === p.id)), ...prev];
                    return merged;
                  });
                  setPendingPosts([]);
                  setTimeout(() => feedListRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
                }}
              >
                <Ionicons name="arrow-up-circle-outline" size={18} color="#fff" />
                <Text style={comp.newPostsBannerText}>
                  {pendingPosts.length > 15 ? '15+ new posts' : `${pendingPosts.length} new post${pendingPosts.length > 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            )}
            <FlatList
              key="feed-real"
              ref={feedListRef}
              data={posts}
              keyExtractor={p => p.id}
              ListHeaderComponent={
                <Pressable
                  style={comp.composerRow}
                  onPress={() => setShowCreate(true)}
                  android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
                >
                  {/* User avatar */}
                  <Avatar
                    url={profile?.avatarUrl ?? null}
                    name={profile?.displayName ?? profile?.email ?? '?'}
                    size={38}
                  />
                  {/* Placeholder text — tapping anywhere opens CreatePostModal */}
                  <View style={comp.composerInputFake}>
                    <Text style={comp.composerPlaceholder}>Share what's on your heart…</Text>
                  </View>
                  {/* Camera/image picker shortcut */}
                  <Pressable
                    style={comp.composerCameraBtn}
                    onPress={() => setShowCreate(true)}
                    hitSlop={8}
                  >
                    <Ionicons name="image-outline" size={22} color={colors.olive} />
                  </Pressable>
                </Pressable>
              }
              renderItem={({ item, index }) => {
                const isNearVisible = [...visibleIndicesSnap].some(vi => Math.abs(vi - index) <= 2);
                return (
                  <PostCard
                    post={item}
                    myId={myUserId}
                    isNearVisible={isNearVisible}
                    onLike={() => handleLike(item)}
                    onComment={() => setCommentPost(item)}
                    onShare={() => handleNativeShare(item)}
                    onShareToRoom={() => setSharePost(item)}
                    onDelete={() => handleDeletePost(item)}
                  />
                );
              }}
              viewabilityConfig={viewabilityConfig.current}
              onViewableItemsChanged={onViewableItemsChanged}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} tintColor={colors.gold} />}
              ListEmptyComponent={
                <View style={main.empty}>
                  <Ionicons name="leaf-outline" size={48} color={colors.inkFaint} style={{ marginBottom: 16 }} />
                  <Text style={main.emptyTitle}>Nothing here yet</Text>
                  <Text style={main.emptyDesc}>Be the first to post something in the community!</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
            />
            </>
          )
      )}

      {/* Chats */}
      {tab === 'chats' && (
        (loadingRooms || (loadError != null && rooms.length === 0))
          ? <FlatList data={[1,2,3,4,5]} keyExtractor={i => String(i)} renderItem={() => <ChatRoomSkeleton />} />
          : (
            <FlatList
              data={rooms}
              keyExtractor={r => r.id}
              ListHeaderComponent={
                pendingRequestCount > 0 ? (
                  <Pressable style={main.requestsBanner} onPress={() => setShowRequestsModal(true)}>
                    <Ionicons name="mail-outline" size={18} color={colors.olive} />
                    <Text style={main.requestsBannerText}>{pendingRequestCount} pending message request{pendingRequestCount > 1 ? 's' : ''}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.olive} />
                  </Pressable>
                ) : null
              }
              renderItem={({ item: room }) => (
                <RoomRow room={room} onPress={() => {
                  navigation.navigate('ChatRoom' as any, {
                    roomId: room.id,
                    roomName: room.type === 'group' ? (room.name ?? 'General') : (room.otherUser?.name ?? 'Chat'),
                  });
                  refreshRooms();
                }} />
              )}
              refreshControl={<RefreshControl refreshing={false} onRefresh={refreshRooms} tintColor={colors.gold} />}
              ListEmptyComponent={
                <View style={main.empty}>
                  <Ionicons name="chatbubble-ellipses-outline" size={48} color={colors.inkFaint} style={{ marginBottom: 16 }} />
                  <Text style={main.emptyTitle}>No chats yet</Text>
                  <Text style={main.emptyDesc}>When you join a church, the General group chat appears here. Tap the compose icon to message a member.</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
            />
          )
      )}

      {/* Notifications */}
      {tab === 'notifications' && <NotificationsTab userId={myUserId} />}

      {/* Profile */}
      {tab === 'profile' && (
        <ProfileTab
          profile={profile}
          profileError={profileError}
          onReload={async () => {
            setProfileError(false);
            try { const p = await getMyProfile(); setProfile(p); setProfileError(false); }
            catch { setProfileError(true); }
          }}
        />
      )}

      <CommentsSheet
        post={commentPost}
        visible={!!commentPost}
        onClose={() => setCommentPost(null)}
        onCommentAdded={(postId) => {
          setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
          ));
        }}
      />
      <CreatePostModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={p => {
        // Immediately prepend own new post and remove it from pendingPosts if
        // the realtime subscription happened to queue it before onCreated fired.
        setPosts(prev => prev.find(x => x.id === p.id) ? prev : [p, ...prev]);
        setPendingPosts(prev => prev.filter(x => x.id !== p.id));
      }} />
      <ShareToRoomModal
        post={sharePost}
        rooms={rooms}
        visible={!!sharePost}
        onClose={() => setSharePost(null)}
        onShared={() => {}}
      />

      {/* Message requests modal */}
      <MessageRequestsModal
        visible={showRequestsModal}
        requests={messageRequests}
        respondingId={respondingId}
        onClose={() => setShowRequestsModal(false)}
        onRespond={handleRespondToRequest}
      />
    </View>
  );
}

// ── Message Requests Modal ────────────────────────────────────────────────────
function MessageRequestsModal({
  visible, requests, respondingId, onClose, onRespond,
}: {
  visible: boolean;
  requests: MessageRequest[];
  respondingId: string | null;
  onClose: () => void;
  onRespond: (req: MessageRequest, action: 'accept' | 'reject' | 'block') => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={mr.backdrop} onPress={onClose} />
      <View style={mr.sheet}>
        {/* Handle */}
        <View style={mr.handle} />
        {/* Header */}
        <View style={mr.header}>
          <Text style={mr.title}>Message Requests</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={22} color={colors.inkSoft} />
          </Pressable>
        </View>
        {requests.length === 0 ? (
          <View style={mr.empty}>
            <Ionicons name="mail-open-outline" size={48} color={colors.inkFaint} />
            <Text style={mr.emptyText}>No pending requests</Text>
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={r => r.id}
            contentContainerStyle={{ paddingBottom: 32 }}
            renderItem={({ item: req }) => {
              const busy = respondingId === req.id;
              return (
                <View style={mr.row}>
                  <Avatar url={req.fromUser.avatarUrl} name={req.fromUser.name} size={46} />
                  <View style={mr.info}>
                    <Text style={mr.name}>{req.fromUser.name}</Text>
                    <Text style={mr.sub}>Wants to send you a message</Text>
                    <Text style={mr.time}>{relTime(req.createdAt)}</Text>
                  </View>
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.olive} />
                  ) : (
                    <View style={mr.actions}>
                      <Pressable
                        style={[mr.btn, mr.btnAccept]}
                        onPress={() => onRespond(req, 'accept')}
                      >
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={mr.btnAcceptText}>Accept</Text>
                      </Pressable>
                      <Pressable
                        style={[mr.btn, mr.btnDecline]}
                        onPress={() => onRespond(req, 'reject')}
                      >
                        <Text style={mr.btnDeclineText}>Decline</Text>
                      </Pressable>
                      <Pressable
                        style={[mr.btn, mr.btnBlock]}
                        onPress={() => onRespond(req, 'block')}
                      >
                        <Ionicons name="ban-outline" size={14} color={colors.danger ?? '#E05252'} />
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const mr = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingTop: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.inkFaint,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.parchment,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15, color: colors.inkSoft },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.parchment,
    gap: spacing.sm,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  time: { fontSize: 11, color: colors.inkFaint, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 7,
  },
  btnAccept: { backgroundColor: colors.olive },
  btnAcceptText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnDecline: { backgroundColor: colors.parchment, borderWidth: 1, borderColor: colors.parchmentDark },
  btnDeclineText: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  btnBlock: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.parchment, borderWidth: 1, borderColor: '#F0C0C0',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 0,
  },
});

// ── Post composer row (feed header) ──────────────────────────────────────────
const comp = StyleSheet.create({
  composerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, marginHorizontal: spacing.md, marginTop: spacing.md,
    marginBottom: spacing.sm, borderRadius: radii.xl, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, ...shadows.subtle,
  },
  composerInputFake: {
    flex: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.parchment, borderRadius: radii.pill,
  },
  composerPlaceholder: { fontSize: 14, color: colors.inkFaint, fontStyle: 'italic' },
  composerCameraBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#EDF7E8', alignItems: 'center', justifyContent: 'center',
  },
  newPostsBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.oliveDark, marginHorizontal: spacing.lg,
    marginTop: spacing.sm, borderRadius: radii.pill,
    paddingVertical: 9, paddingHorizontal: spacing.lg,
    ...shadows.card,
  },
  newPostsBannerText: { fontSize: 13, fontWeight: '700', color: '#fff' },
});

const main = StyleSheet.create({
  header: { paddingBottom: 0 },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)' },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 12, justifyContent: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: colors.goldLight },
  notifBadge: { position: 'absolute', top: -4, right: -6, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#E05252', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  requestsBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: '#EDF7E8', paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#C2D4A0',
  },
  requestsBannerText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.oliveDark },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  emptyDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: 'center', lineHeight: 22 },
});
