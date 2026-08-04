/**
 * ChatRoomScreen — real-time group / DM chat room.
 * Uses Supabase Realtime for live messages.
 * Supports text, image, and voice notes.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  Image, TouchableOpacity, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { AudioModule, useAudioRecorder, RecordingPresets, useAudioPlayer } from 'expo-audio';
import { colors, radii, spacing, typography, shadows } from '../../theme/theme';
import type { RootStackParamList } from '../../navigation/AppNavigator';
import {
  getRoomMessages, sendMessage, uploadMessageMedia,
  markRoomRead, subscribeToRoom, subscribeToRoomReadReceipts,
  getRoomPartnerLastRead, respondToRequest, blockUser,
  type ChatMessage,
} from '../../lib/communityApi';
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatRoom'>;

// ── Avatar ─────────────────────────────────────────────────────────────────────
function Avatar({ url, name, size = 32 }: { url: string | null; name: string; size?: number }) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase();
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.parchmentDark }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.36, fontWeight: '700' }}>{initials}</Text>
    </View>
  );
}

// ── Voice note player ─────────────────────────────────────────────────────────
function VoicePlayer({ uri, duration }: { uri: string; duration: number | null }) {
  const player = useAudioPlayer({ uri });
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function toggle() {
    if (playing) {
      player.pause();
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
      intervalRef.current = setInterval(() => {
        const pos = player.currentTime ?? 0;
        const dur = player.duration ?? duration ?? 1;
        setProgress(Math.min(pos / dur, 1));
        if (pos >= dur) { clearInterval(intervalRef.current!); setPlaying(false); setProgress(0); }
      }, 200);
    }
  }
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const secs = Math.round(duration ?? 0);
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <Pressable style={vp.wrap} onPress={toggle}>
      <Text style={vp.icon}>{playing ? '⏸' : '▶'}</Text>
      <View style={vp.barBg}>
        <View style={[vp.barFill, { width: `${Math.round(progress * 100)}%` }]} />
      </View>
      <Text style={vp.dur}>{label}</Text>
    </Pressable>
  );
}
const vp = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, minWidth: 160 },
  icon: { fontSize: 16, color: colors.olive },
  barBg: { flex: 1, height: 4, backgroundColor: colors.parchmentDark, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: 4, backgroundColor: colors.olive, borderRadius: 2 },
  dur: { fontSize: 11, color: colors.inkFaint, minWidth: 32, textAlign: 'right' },
});

// ── Message bubble ─────────────────────────────────────────────────────────────
function Bubble({ msg, isMine, showAvatar, seenByPartner }: { msg: ChatMessage; isMine: boolean; showAvatar: boolean; seenByPartner?: boolean }) {
  const timeStr = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[bb.row, isMine && bb.rowMine]}>
      {!isMine && showAvatar
        ? <View style={bb.avatarSlot}><Avatar url={msg.sender.avatarUrl} name={msg.sender.name} size={28} /></View>
        : <View style={bb.avatarSlot} />}
      <View style={[bb.bubble, isMine ? bb.bubbleMine : bb.bubbleOther, msg.type === 'image' && bb.imageBubble]}>
        {!isMine && showAvatar && <Text style={bb.senderName}>{msg.sender.name}</Text>}
        {msg.type === 'text' && <Text style={[bb.bodyText, isMine && bb.bodyTextMine]}>{msg.body}</Text>}
        {msg.type === 'image' && msg.mediaUrl && (
          <Image source={{ uri: msg.mediaUrl }} style={bb.image} resizeMode="cover" />
        )}
        {msg.type === 'voice' && msg.mediaUrl && (
          <VoicePlayer uri={msg.mediaUrl} duration={msg.durationSeconds} />
        )}
        {msg.type === 'post_share' && (
          <View style={bb.shareCard}>
            <Text style={bb.shareLabel}>Shared a post</Text>
            {msg.body && <Text style={[bb.bodyText, { marginTop: 4 }]} numberOfLines={3}>{msg.body}</Text>}
          </View>
        )}
        <View style={bb.timeRow}>
          <Text style={[bb.time, isMine && bb.timeMine]}>{timeStr}</Text>
          {isMine && (
            <View style={bb.seenIndicator}>
              {seenByPartner
                ? <Ionicons name="checkmark-done" size={13} color="#7EC8E3" />
                : <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.45)" />}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
const bb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4, paddingHorizontal: spacing.md },
  rowMine: { flexDirection: 'row-reverse' },
  avatarSlot: { width: 32, marginHorizontal: 6 },
  bubble: { maxWidth: '72%', borderRadius: 18, padding: spacing.sm + 2, ...shadows.subtle },
  bubbleOther: { backgroundColor: colors.white, borderBottomLeftRadius: 4 },
  bubbleMine: { backgroundColor: colors.olive, borderBottomRightRadius: 4 },
  imageBubble: { padding: 3, overflow: 'hidden' },
  senderName: { fontSize: 11, fontWeight: '700', color: colors.olive, marginBottom: 3 },
  bodyText: { fontSize: 15, color: colors.ink, lineHeight: 21 },
  bodyTextMine: { color: '#fff' },
  image: { width: 200, height: 160, borderRadius: 15 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  time: { fontSize: 10, color: colors.inkFaint },
  timeMine: { color: 'rgba(255,255,255,0.55)' },
  seenIndicator: { justifyContent: 'center' },
  shareCard: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: radii.sm, padding: spacing.sm, marginBottom: 4 },
  shareLabel: { fontSize: 11, fontWeight: '700', color: colors.goldLight, marginBottom: 2 },
});

// ── Recording button ──────────────────────────────────────────────────────────
function RecordButton({ onRecordingDone }: { onRecordingDone: (uri: string, duration: number) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTime = useRef(Date.now());
  const pulseAnim = useRef(new Animated.Value(1)).current;

  async function start() {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) { Alert.alert('Permission required', 'Please allow microphone access.'); return; }
      await recorder.record();
      setRecording(true);
      startTime.current = Date.now();
      setSeconds(0);
      timer.current = setInterval(() => setSeconds(s => s + 1), 1000);
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])).start();
    } catch { Alert.alert('Recording error', 'Could not start recording. Please try again.'); }
  }

  async function stop() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
    setRecording(false);
    const duration = Math.round((Date.now() - startTime.current) / 1000);
    await recorder.stop();
    const uri = recorder.uri;
    if (uri) onRecordingDone(uri, duration);
    setSeconds(0);
  }

  return recording ? (
    <View style={rb.recRow}>
      <Animated.View style={[rb.recDot, { transform: [{ scale: pulseAnim }] }]} />
      <Text style={rb.recTime}>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2,'0')}</Text>
      <Pressable style={rb.stopBtn} onPress={stop}>
        <Ionicons name="stop" size={14} color="#fff" />
      </Pressable>
    </View>
  ) : (
    <Pressable style={rb.micBtn} onLongPress={start} onPress={start}>
      <Ionicons name="mic-outline" size={20} color={colors.inkSoft} />
    </Pressable>
  );
}
const rb = StyleSheet.create({
  micBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.parchment, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.parchmentDark },
  recRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.sm },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E05252' },
  recTime: { fontSize: 14, fontWeight: '600', color: colors.ink },
  stopBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#E05252', alignItems: 'center', justifyContent: 'center' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Main screen
// ═══════════════════════════════════════════════════════════════════════════════
export default function ChatRoomScreen({ route, navigation }: Props) {
  const { roomId, roomName } = route.params as { roomId: string; roomName: string };
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [myId, setMyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [partnerLastReadAt, setPartnerLastReadAt] = useState<string | null>(null);
  const hasMore = useRef(true);

  useEffect(() => {
    navigation.setOptions({ title: roomName, headerShown: true });

    let userId: string | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setMyId(user.id); userId = user.id; }
    });

    // Load initial messages
    getRoomMessages(roomId).then(msgs => {
      setMessages(msgs);
      setLoading(false);
      hasMore.current = msgs.length === 40;
    }).catch(() => setLoading(false));

    // Load partner's last read timestamp (for DMs)
    getRoomPartnerLastRead(roomId).then(ts => setPartnerLastReadAt(ts)).catch(() => {});

    markRoomRead(roomId).catch(() => {});

    // Real-time subscription for new messages
    const unsub = subscribeToRoom(roomId, (msg) => {
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      flatRef.current?.scrollToEnd({ animated: true });
      markRoomRead(roomId).catch(() => {});
    });

    // Subscribe to read receipts (partner marks room as read)
    let unsubReceipts: (() => void) | null = null;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        unsubReceipts = subscribeToRoomReadReceipts(roomId, user.id, (lastReadAt) => {
          setPartnerLastReadAt(lastReadAt);
        });
      }
    });

    return () => {
      unsub();
      unsubReceipts?.();
    };
  }, [roomId]);

  async function loadMore() {
    if (loadingMore || !hasMore.current || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await getRoomMessages(roomId, messages[0].createdAt);
      setMessages(prev => [...older, ...prev]);
      hasMore.current = older.length === 40;
    } catch {}
    setLoadingMore(false);
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText('');
    setSending(true);
    try {
      const msg = await sendMessage(roomId, { type: 'text', body });
      setMessages(prev => [...prev, msg]);
      flatRef.current?.scrollToEnd({ animated: true });
    } catch { Alert.alert('Error', 'Message could not be sent. Please try again.'); setText(body); }
    finally { setSending(false); }
  }

  async function sendImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      const url = await uploadMessageMedia(roomId, res.assets[0].uri, 'image');
      const msg = await sendMessage(roomId, { type: 'image', mediaUrl: url });
      setMessages(prev => [...prev, msg]);
      flatRef.current?.scrollToEnd({ animated: true });
    } catch { Alert.alert('Upload error', 'Upload failed. Please try again.'); }
    finally { setUploading(false); }
  }

  async function handleVoice(uri: string, duration: number) {
    setUploading(true);
    try {
      const url = await uploadMessageMedia(roomId, uri, 'voice');
      const msg = await sendMessage(roomId, { type: 'voice', mediaUrl: url, durationSeconds: duration });
      setMessages(prev => [...prev, msg]);
      flatRef.current?.scrollToEnd({ animated: true });
    } catch { Alert.alert('Upload error', 'Upload failed. Please try again.'); }
    finally { setUploading(false); }
  }

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.parchment, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.gold} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F2EDE0' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={{ paddingVertical: spacing.md, paddingBottom: 8 }}
        onStartReached={loadMore}
        onStartReachedThreshold={0.2}
        ListHeaderComponent={loadingMore ? <ActivityIndicator color={colors.gold} size="small" style={{ marginVertical: 8 }} /> : null}
        renderItem={({ item: msg, index }) => {
          const isMine = msg.sender.userId === myId;
          const showAvatar = !isMine && (index === 0 || messages[index - 1]?.sender.userId !== msg.sender.userId);
          // Seen indicator: message was sent before partner's last_read_at
          const seenByPartner = isMine && partnerLastReadAt != null
            && new Date(msg.createdAt) <= new Date(partnerLastReadAt);
          return <Bubble msg={msg} isMine={isMine} showAvatar={showAvatar} seenByPartner={seenByPartner} />;
        }}
        ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 60 }}><Text style={{ fontSize: 40, marginBottom: 12 }}>💬</Text><Text style={{ color: colors.inkFaint, fontSize: 14 }}>No messages yet. Say hello!</Text></View>}
        onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
      />

      {/* Input bar */}
      <View style={[inp.bar, { paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm }]}>
        {uploading && <View style={inp.uploadingBanner}><ActivityIndicator size="small" color={colors.gold} /><Text style={inp.uploadingText}>Uploading…</Text></View>}
        <View style={inp.row}>
          <Pressable style={inp.attachBtn} onPress={sendImage}>
            <Ionicons name="image-outline" size={22} color={colors.inkSoft} />
          </Pressable>
          <TextInput
            style={inp.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.inkFaint}
            multiline
            maxLength={2000}
          />
          {text.trim() ? (
            <Pressable style={[inp.sendBtn, sending && { opacity: 0.6 }]} onPress={send} disabled={sending}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </Pressable>
          ) : (
            <RecordButton onRecordingDone={handleVoice} />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const inp = StyleSheet.create({
  bar: { backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.parchmentDark, paddingTop: spacing.sm, paddingHorizontal: spacing.md },
  uploadingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: spacing.xs },
  uploadingText: { fontSize: 12, color: colors.inkFaint },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  attachBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  attachIcon: { fontSize: 22 },
  input: { flex: 1, backgroundColor: colors.parchment, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 15, color: colors.ink, maxHeight: 100, lineHeight: 20 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.olive, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
