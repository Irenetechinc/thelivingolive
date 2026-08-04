/**
 * StoryViewer — full-screen story viewer with progress bars and auto-advance.
 * Tap left 30% = back, tap right 70% = forward.
 * Long-press own story to delete.
 * Progress: 5 s per photo, video plays to its natural end (capped 60 s).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Pressable, Image, Animated,
  Dimensions, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import { colors, spacing, shadows } from '../../theme/theme';
import { deleteStory, viewStory } from '../../lib/communityApi';
import type { Story } from '../../lib/communityApi';

function AvatarSmall({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '700' }}>{(name ?? '?').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const { width: W, height: H } = Dimensions.get('window');
const PHOTO_DURATION = 5000; // ms

type Props = {
  stories: Story[];
  startIndex: number;
  myUserId: string | null;
  visible: boolean;
  onClose: () => void;
  onDeleted?: (storyId: string) => void;
};

export default function StoryViewer({ stories, startIndex, myUserId, visible, onClose, onDeleted }: Props) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const progress = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const story = stories[index] ?? null;
  const isOwn = story?.userId === myUserId;

  // Reset to startIndex whenever viewer opens
  useEffect(() => {
    if (visible) setIndex(startIndex);
  }, [visible, startIndex]);

  // Start progress animation for current story
  const startProgress = useCallback((duration: number) => {
    progress.setValue(0);
    animRef.current?.stop();
    animRef.current = Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    animRef.current.start(({ finished }) => {
      if (finished) advance(1);
    });
  }, []);

  // Advance forward or backward
  const advance = useCallback((dir: 1 | -1) => {
    setIndex(prev => {
      const next = prev + dir;
      if (next < 0 || next >= stories.length) {
        onClose();
        return prev;
      }
      return next;
    });
  }, [stories.length, onClose]);

  // When index changes, fire view event and start timer
  useEffect(() => {
    if (!visible || !story) return;
    // Record view (best-effort)
    if (!story.seenByMe) {
      viewStory(story.id).catch(() => {});
    }
    if (story.mediaType === 'photo') {
      startProgress(PHOTO_DURATION);
    }
    // For video, progress is started once VideoPlayer reports duration
    return () => {
      animRef.current?.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, visible]);

  // Video story: Video player
  const player = useVideoPlayer(
    story?.mediaType === 'video' ? story.mediaUrl : null,
    p => {
      if (p) {
        p.loop = false;
        p.play();
      }
    }
  );

  // When video player emits playback status / ends
  useEffect(() => {
    if (!player || story?.mediaType !== 'video') return;
    const sub = player.addListener('playingChange', (isPlaying) => {
      if (!isPlaying && player.currentTime > 0) {
        advance(1);
      }
    });
    return () => sub.remove();
  }, [player, story?.mediaType]);

  async function handleDelete() {
    if (!story || !isOwn) return;
    Alert.alert(
      'Delete Story',
      'Remove this story? It will disappear for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteStory(story.id);
              onDeleted?.(story.id);
              if (stories.length <= 1) {
                onClose();
              } else {
                advance(1);
              }
            } catch {
              Alert.alert('Error', 'Could not delete story. Try again.');
            }
          },
        },
      ]
    );
  }

  if (!visible || !story) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={sv.container}>
        {/* Media */}
        {story.mediaType === 'photo' ? (
          <Image
            source={{ uri: story.mediaUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        )}

        {/* Dark overlay gradient at top and bottom */}
        <View style={sv.topGradient} pointerEvents="none" />
        <View style={sv.bottomGradient} pointerEvents="none" />

        {/* Progress bars */}
        <View style={[sv.progressWrap, { marginTop: insets.top + 8 }]}>
          {stories.map((_, i) => (
            <View key={i} style={[sv.progressTrack, { flex: 1 }]}>
              <View
                style={[
                  sv.progressFill,
                  i < index && sv.progressDone,
                  i > index && sv.progressEmpty,
                ]}
              >
                {i === index && (
                  <Animated.View
                    style={[
                      sv.progressFill,
                      sv.progressDone,
                      { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                    ]}
                  />
                )}
              </View>
            </View>
          ))}
        </View>

        {/* Author row */}
        <View style={[sv.authorRow, { marginTop: insets.top + 28 }]}>
          <AvatarSmall url={story.authorAvatarUrl} name={story.authorName} size={36} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={sv.authorName}>{story.authorName}</Text>
            <Text style={sv.storyTime}>{relTime(story.createdAt)}</Text>
          </View>
          {isOwn && (
            <View style={sv.viewCount}>
              <Ionicons name="eye-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={sv.viewCountText}>{story.viewCount}</Text>
            </View>
          )}
          <Pressable onPress={onClose} hitSlop={12} style={{ marginLeft: spacing.md }}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        {/* Caption */}
        {story.caption ? (
          <View style={sv.captionWrap}>
            <Text style={sv.captionText}>{story.caption}</Text>
          </View>
        ) : null}

        {/* Tap zones: left = back, right = forward */}
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Pressable
              style={{ flex: 3 }}
              onPress={() => advance(-1)}
              onLongPress={isOwn ? handleDelete : undefined}
              delayLongPress={600}
            />
            <Pressable
              style={{ flex: 7 }}
              onPress={() => advance(1)}
              onLongPress={isOwn ? handleDelete : undefined}
              delayLongPress={600}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const sv = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topGradient: {
    position: 'absolute', left: 0, right: 0, top: 0, height: 180,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bottomGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 160,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  progressWrap: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: 3,
    zIndex: 10,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },
  progressDone: { backgroundColor: '#fff', width: '100%' },
  progressEmpty: { backgroundColor: 'transparent', width: '0%' },
  authorRow: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  authorName: { color: '#fff', fontSize: 14, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  storyTime: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
  viewCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewCountText: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  captionWrap: {
    position: 'absolute',
    bottom: 60,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
  },
  captionText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
