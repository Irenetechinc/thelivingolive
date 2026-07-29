/**
 * OliveChatScreen — Olive Chat main screen.
 * Tabs: Feed (timeline) | Chats (rooms) | Profile
 * Gated by church membership + optional PIN lock.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput,
  ScrollView, ActivityIndicator, Image, TouchableOpacity, Modal,
  KeyboardAvoidingView, Platform, Share, Alert, RefreshControl,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  getRooms, getTimeline, createPost, uploadPostMedia,
  togglePostLike, getPostComments, addPostComment, toggleCommentLike,
  type UserProfile, type CommunityPost, type PostComment, type ChatRoom,
} from '../../lib/communityApi';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Tab = 'feed' | 'chats' | 'profile';

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

// ── Relative time ─────────────────────────────────────────────────────────────
function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Video post component ──────────────────────────────────────────────────────
function VideoPost({ videoUrl, thumbnailUrl }: { videoUrl: string; thumbnailUrl: string | null }) {
  const [playing, setPlaying] = useState(false);
  const player = useVideoPlayer({ uri: videoUrl }, p => { p.loop = false; });
  return (
    <View style={vs.wrap}>
      {!playing ? (
        <Pressable onPress={() => { setPlaying(true); player.play(); }} style={vs.thumbWrap}>
          {thumbnailUrl
            ? <Image source={{ uri: thumbnailUrl }} style={vs.thumb} resizeMode="cover" />
            : <View style={[vs.thumb, { backgroundColor: '#1a1a1a' }]} />}
          <View style={vs.playBtn}><Text style={vs.playIcon}>▶</Text></View>
        </Pressable>
      ) : (
        <VideoView style={vs.thumb} player={player} contentFit="cover" />
      )}
    </View>
  );
}
const vs = StyleSheet.create({
  wrap: { borderRadius: radii.md, overflow: 'hidden', marginTop: spacing.sm, backgroundColor: '#000' },
  thumbWrap: { position: 'relative' },
  thumb: { width: '100%', height: 220 },
  playBtn: { position: 'absolute', top: '50%', left: '50%', marginTop: -24, marginLeft: -24, width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#fff', fontSize: 20, marginLeft: 4 },
});

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({ post, onLike, onComment, onShare }: {
  post: CommunityPost;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
}) {
  const heartAnim = useRef(new Animated.Value(1)).current;
  function animLike() {
    Animated.sequence([
      Animated.spring(heartAnim, { toValue: 1.4, useNativeDriver: true, tension: 120 }),
      Animated.spring(heartAnim, { toValue: 1, useNativeDriver: true, tension: 80 }),
    ]).start();
    onLike();
  }
  return (
    <View style={ps.card}>
      <View style={ps.header}>
        <Avatar url={post.author.avatarUrl} name={post.author.name} size={40} />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={ps.authorName}>{post.author.name}</Text>
          <Text style={ps.time}>{relTime(post.createdAt)}</Text>
        </View>
      </View>
      {post.body ? <Text style={ps.body}>{post.body}</Text> : null}
      {post.imageUrl ? <Image source={{ uri: post.imageUrl }} style={ps.image} resizeMode="cover" /> : null}
      {post.videoUrl ? <VideoPost videoUrl={post.videoUrl} thumbnailUrl={post.videoThumbnailUrl} /> : null}
      <View style={ps.actions}>
        <Pressable style={ps.actionBtn} onPress={animLike}>
          <Animated.Text style={[ps.actionIcon, { transform: [{ scale: heartAnim }], color: post.liked ? '#E05252' : colors.inkFaint }]}>♥</Animated.Text>
          <Text style={[ps.actionText, post.liked && { color: '#E05252' }]}>{post.likeCount || ''}</Text>
        </Pressable>
        <Pressable style={ps.actionBtn} onPress={onComment}>
          <Text style={ps.actionIcon}>💬</Text>
          <Text style={ps.actionText}>{post.commentCount || ''}</Text>
        </Pressable>
        <Pressable style={ps.actionBtn} onPress={onShare}>
          <Text style={ps.actionIcon}>↗</Text>
          <Text style={ps.actionText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}
const ps = StyleSheet.create({
  card: { backgroundColor: colors.white, marginBottom: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, ...shadows.subtle },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  authorName: { ...typography.subtitle, color: colors.ink, fontSize: 14 },
  time: { ...typography.micro, color: colors.inkFaint, marginTop: 2 },
  body: { ...typography.body, color: colors.ink, lineHeight: 22, marginBottom: spacing.sm },
  image: { width: '100%', height: 220, borderRadius: radii.md, backgroundColor: colors.parchmentDark, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.lg, borderTopWidth: 1, borderTopColor: colors.parchmentDark, paddingTop: spacing.sm, marginTop: spacing.xs },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionIcon: { fontSize: 17, color: colors.inkFaint },
  actionText: { fontSize: 13, color: colors.inkFaint, fontWeight: '600' },
});

// ── Comments bottom sheet ─────────────────────────────────────────────────────
function CommentsSheet({ post, visible, onClose }: { post: CommunityPost | null; visible: boolean; onClose: () => void }) {
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
      }
      setText(''); setReplyTo(null);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSending(false); }
  }

  function renderComment(c: PostComment, isReply = false) {
    return (
      <View key={c.id} style={[cs.row, isReply && cs.replyRow]}>
        <Avatar url={c.author.avatarUrl} name={c.author.name} size={isReply ? 28 : 34} />
        <View style={cs.bubble}>
          <Text style={cs.commentAuthor}>{c.author.name} <Text style={cs.commentTime}>{relTime(c.createdAt)}</Text></Text>
          <Text style={cs.commentBody}>{c.body}</Text>
          <View style={cs.commentActions}>
            <TouchableOpacity onPress={() => { if (post) toggleCommentLike(post.id, c.id).catch(() => {}); }}>
              <Text style={cs.commentAction}>♥ {c.likeCount > 0 ? c.likeCount : ''}</Text>
            </TouchableOpacity>
            {!isReply && <TouchableOpacity onPress={() => setReplyTo(c)}><Text style={cs.commentAction}>Reply</Text></TouchableOpacity>}
          </View>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.parchment }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              <View>{renderComment(c)}{c.replies.map(r => renderComment(r, true))}</View>
            )}
            ListEmptyComponent={<Text style={cs.empty}>No comments yet. Be the first!</Text>}
          />
        )}
        {replyTo && (
          <View style={cs.replyBanner}>
            <Text style={cs.replyBannerText}>Replying to {replyTo.author.name}</Text>
            <Pressable onPress={() => setReplyTo(null)}><Text style={cs.replyBannerClose}>✕</Text></Pressable>
          </View>
        )}
        <View style={cs.inputRow}>
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
  inputRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.parchmentDark, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: colors.parchment, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink, maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  replyBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: colors.parchment, borderTopWidth: 1, borderTopColor: colors.parchmentDark },
  replyBannerText: { fontSize: 12, color: colors.olive },
  replyBannerClose: { fontSize: 14, color: colors.inkFaint },
  empty: { textAlign: 'center', color: colors.inkFaint, paddingVertical: 24, fontSize: 14 },
});

// ── Create post modal ─────────────────────────────────────────────────────────
function CreatePostModal({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (p: CommunityPost) => void }) {
  const [text, setText] = useState('');
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
  const [thumbUri, setThumbUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function pickMedia() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
    if (!res.canceled && res.assets[0]) {
      const asset = res.assets[0];
      setMediaUri(asset.uri);
      if (asset.type === 'video') {
        setMediaType('video');
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 1000 });
          setThumbUri(uri);
        } catch {}
      } else {
        setMediaType('image');
        setThumbUri(null);
      }
    }
  }

  async function submit() {
    if (!text.trim() && !mediaUri) return;
    setUploading(true);
    try {
      let imageUrl: string | undefined, videoUrl: string | undefined, videoThumbnailUrl: string | undefined;
      if (mediaUri && mediaType === 'image') {
        imageUrl = await uploadPostMedia(mediaUri, 'image/jpeg');
      } else if (mediaUri && mediaType === 'video') {
        videoUrl = await uploadPostMedia(mediaUri, 'video/mp4');
        if (thumbUri) videoThumbnailUrl = await uploadPostMedia(thumbUri, 'image/jpeg');
      }
      const post = await createPost({ body: text.trim() || undefined, imageUrl, videoUrl, videoThumbnailUrl });
      onCreated(post);
      setText(''); setMediaUri(null); setMediaType(null); setThumbUri(null);
      onClose();
    } catch (e: any) { Alert.alert('Error', e.message); }
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
          <TextInput style={cpm.textInput} value={text} onChangeText={setText} placeholder="What's on your heart today?" placeholderTextColor={colors.inkFaint} multiline autoFocus textAlignVertical="top" />
          {mediaUri && mediaType === 'image' && <Image source={{ uri: mediaUri }} style={cpm.preview} resizeMode="cover" />}
          {mediaUri && mediaType === 'video' && (
            <View style={cpm.preview}>
              {thumbUri ? <Image source={{ uri: thumbUri }} style={{ flex: 1, borderRadius: radii.md }} resizeMode="cover" /> : <View style={[cpm.preview, { backgroundColor: '#111' }]} />}
              <View style={vs.playBtn}><Text style={vs.playIcon}>▶</Text></View>
            </View>
          )}
          <View style={cpm.toolbar}>
            <Pressable style={cpm.toolBtn} onPress={pickMedia}>
              <Text style={cpm.toolIcon}>🖼</Text>
              <Text style={cpm.toolLabel}>Photo/Video</Text>
            </Pressable>
            {mediaUri && <Pressable style={cpm.toolBtn} onPress={() => { setMediaUri(null); setMediaType(null); setThumbUri(null); }}><Text style={cpm.toolLabel}>Remove media</Text></Pressable>}
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
  toolIcon: { fontSize: 18 },
  toolLabel: { fontSize: 13, color: colors.inkSoft, fontWeight: '600' },
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
  bg: { ...StyleSheet.absoluteFillObject, zIndex: 100 },
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
function ProfileTab({ profile, onReload }: { profile: UserProfile | null; onReload: () => void }) {
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
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    try {
      if (type === 'avatar') await uploadAvatar(res.assets[0].uri);
      else await uploadCover(res.assets[0].uri);
      onReload();
    } catch (e: any) { Alert.alert('Upload error', e.message); }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try { await updateProfile({ displayName: name.trim(), bio: bio.trim(), dateOfBirth: dob || undefined }); onReload(); setEditing(false); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSavingProfile(false); }
  }

  async function handleSetPin() {
    if (!newPin.trim()) { await setPin(null); setPinSet(false); setPinModal(false); setNewPin(''); return; }
    if (!/^\d{4,8}$/.test(newPin)) { Alert.alert('Invalid PIN', 'PIN must be 4–8 digits'); return; }
    setSettingPin(true);
    try { await setPin(newPin); setPinSet(true); setPinModal(false); setNewPin(''); Alert.alert('PIN set', 'Your Olive Chat PIN has been saved.'); }
    catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSettingPin(false); }
  }

  if (!profile) return <ActivityIndicator color={colors.gold} style={{ marginTop: 60 }} />;
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Cover */}
      <Pressable onPress={() => pickAndUpload('cover')}>
        <View style={pf.cover}>
          {profile.coverUrl ? <Image source={{ uri: profile.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <LinearGradient colors={['#3E4A2F','#8A6A10']} style={StyleSheet.absoluteFill} />}
          <View style={pf.coverEdit}><Text style={pf.coverEditText}>Edit cover</Text></View>
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
            {profile.email ? <Text style={pf.emailText}>📧 {profile.email}</Text> : null}
            {profile.dateOfBirth ? <Text style={pf.emailText}>🎂 {profile.dateOfBirth}</Text> : null}
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
      {/* PIN modal */}
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
  emailText: { fontSize: 13, color: colors.inkFaint, marginBottom: 3 },
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

// ── Chats tab ─────────────────────────────────────────────────────────────────
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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [notMember, setNotMember] = useState(false);
  const [commentPost, setCommentPost] = useState<CommunityPost | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      try {
        // Check PIN
        const pinActive = await getPinStatus();
        if (active) { setPinLocked(pinActive); setPinChecked(true); }
        // Load profile
        const p = await getMyProfile();
        if (active) setProfile(p);
        // Load feed
        const feed = await getTimeline();
        if (active) { setPosts(feed); setLoadingFeed(false); }
        // Load rooms
        const r = await getRooms();
        if (active) { setRooms(r); setLoadingRooms(false); }
      } catch (e: any) {
        if (e.message?.includes('church')) { if (active) { setNotMember(true); setLoadingFeed(false); setLoadingRooms(false); setPinChecked(true); } }
        else { if (active) { setLoadingFeed(false); setLoadingRooms(false); setPinChecked(true); } }
      }
    })();
    return () => { active = false; };
  }, []));

  async function refreshFeed() {
    setRefreshing(true);
    try { const feed = await getTimeline(); setPosts(feed); } catch {}
    setRefreshing(false);
  }

  async function refreshRooms() {
    try { const r = await getRooms(); setRooms(r); } catch {}
  }

  async function handleLike(post: CommunityPost) {
    try {
      const { liked, likeCount } = await togglePostLike(post.id);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, liked, likeCount } : p));
    } catch {}
  }

  async function handleShare(post: CommunityPost) {
    try {
      const msg = post.body ?? (post.imageUrl ? '[Image]' : '[Video]');
      await Share.share({ message: `${post.author.name} shared: ${msg}`, url: post.imageUrl ?? post.videoUrl ?? undefined });
    } catch {}
  }

  if (!pinChecked) return <View style={{ flex: 1, backgroundColor: '#2E3A1F', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.goldLight} /></View>;
  if (pinLocked) return <PinGate onVerified={() => setPinLocked(false)} />;

  if (notMember) return (
    <View style={{ flex: 1, backgroundColor: colors.parchment, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
      <Text style={{ fontSize: 48, marginBottom: 20 }}>⛪</Text>
      <Text style={{ ...typography.title, color: colors.ink, textAlign: 'center', marginBottom: 12 }}>Join a Church First</Text>
      <Text style={{ ...typography.body, color: colors.inkSoft, textAlign: 'center', lineHeight: 22 }}>You need to select your church in the Bulletin section before you can access Olive Chat.</Text>
    </View>
  );

  const TABS: { key: Tab; icon: string; label: string }[] = [
    { key: 'feed', icon: '🌿', label: 'Feed' },
    { key: 'chats', icon: '💬', label: 'Chats' },
    { key: 'profile', icon: '👤', label: 'Profile' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.parchment }}>
      {/* Header */}
      <LinearGradient colors={['#2E3A1F','#3E4A2F','#5B6B45']} style={[main.header, { paddingTop: spacing.sm + insets.top }]}>
        <View style={main.headerInner}>
          <Text style={main.headerTitle}>🫒 Olive Chat</Text>
          {tab === 'chats' && (
            <Pressable style={main.headerBtn} onPress={() => navigation.navigate('CommunityMembers' as any)}>
              <Text style={main.headerBtnText}>✏️ New DM</Text>
            </Pressable>
          )}
          {tab === 'feed' && (
            <Pressable style={main.headerBtn} onPress={() => setShowCreate(true)}>
              <Text style={main.headerBtnText}>+ Post</Text>
            </Pressable>
          )}
        </View>
        {/* Tab bar */}
        <View style={main.tabBar}>
          {TABS.map(t => (
            <Pressable key={t.key} style={[main.tabItem, tab === t.key && main.tabItemActive]} onPress={() => setTab(t.key)}>
              <Text style={main.tabIcon}>{t.icon}</Text>
              <Text style={[main.tabLabel, tab === t.key && main.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {/* Feed */}
      {tab === 'feed' && (
        loadingFeed ? <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} /> : (
          <FlatList
            data={posts}
            keyExtractor={p => p.id}
            renderItem={({ item }) => (
              <PostCard
                post={item}
                onLike={() => handleLike(item)}
                onComment={() => setCommentPost(item)}
                onShare={() => handleShare(item)}
              />
            )}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFeed} tintColor={colors.gold} />}
            ListEmptyComponent={<View style={main.empty}><Text style={main.emptyIcon}>🌿</Text><Text style={main.emptyTitle}>Nothing here yet</Text><Text style={main.emptyDesc}>Be the first to post something in the community!</Text></View>}
            contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
          />
        )
      )}

      {/* Chats */}
      {tab === 'chats' && (
        loadingRooms ? <ActivityIndicator color={colors.gold} style={{ marginTop: 40 }} /> : (
          <FlatList
            data={rooms}
            keyExtractor={r => r.id}
            renderItem={({ item: room }) => (
              <RoomRow room={room} onPress={() => {
                navigation.navigate('ChatRoom' as any, { roomId: room.id, roomName: room.type === 'group' ? (room.name ?? 'General') : (room.otherUser?.name ?? 'Chat') });
                refreshRooms();
              }} />
            )}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refreshRooms} tintColor={colors.gold} />}
            ListEmptyComponent={<View style={main.empty}><Text style={main.emptyIcon}>💬</Text><Text style={main.emptyTitle}>No chats yet</Text><Text style={main.emptyDesc}>When you join a church, the General group chat will appear here. Tap "New DM" to message a member.</Text></View>}
            contentContainerStyle={{ paddingBottom: 80 + insets.bottom }}
          />
        )
      )}

      {/* Profile */}
      {tab === 'profile' && <ProfileTab profile={profile} onReload={async () => { try { const p = await getMyProfile(); setProfile(p); } catch {} }} />}

      <CommentsSheet post={commentPost} visible={!!commentPost} onClose={() => setCommentPost(null)} />
      <CreatePostModal visible={showCreate} onClose={() => setShowCreate(false)} onCreated={p => setPosts(prev => [p, ...prev])} />
    </View>
  );
}

const main = StyleSheet.create({
  header: { paddingBottom: 0 },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: -0.3 },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  headerBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  tabBar: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)' },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 10, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: colors.goldLight },
  tabIcon: { fontSize: 15 },
  tabLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  tabLabelActive: { color: '#fff' },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { ...typography.subtitle, color: colors.ink, marginBottom: 8 },
  emptyDesc: { ...typography.bodySmall, color: colors.inkSoft, textAlign: 'center', lineHeight: 22 },
});
