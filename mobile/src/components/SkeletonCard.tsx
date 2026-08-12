/**
 * SkeletonCard — reusable animated skeleton loading placeholder.
 * Used across all screens while data is loading.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii, spacing } from '../theme/theme';

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  delay?: number;
}

export function SkeletonBox({ width = '100%', height = 16, borderRadius = 8, style, delay = 0 }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 800, delay, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[{
        backgroundColor: colors.parchmentDark,
        borderRadius,
        width: width as any,
        height,
        opacity,
      }, style]}
    />
  );
}

// ── Feed post skeleton ─────────────────────────────────────────────────────────
export function PostSkeleton() {
  return (
    <View style={sk.postCard}>
      <View style={sk.postHeader}>
        <SkeletonBox width={44} height={44} borderRadius={22} />
        <View style={{ flex: 1, gap: 6 }}>
          <SkeletonBox width="55%" height={13} borderRadius={6} />
          <SkeletonBox width="30%" height={10} borderRadius={5} />
        </View>
      </View>
      <SkeletonBox height={14} style={{ marginBottom: 8 }} />
      <SkeletonBox height={14} width="85%" style={{ marginBottom: 8 }} />
      <SkeletonBox height={14} width="60%" style={{ marginBottom: 12 }} />
      <SkeletonBox height={200} borderRadius={12} style={{ marginBottom: 12 }} />
      <View style={sk.actionRow}>
        <SkeletonBox width={64} height={28} borderRadius={14} />
        <SkeletonBox width={64} height={28} borderRadius={14} />
        <SkeletonBox width={64} height={28} borderRadius={14} />
      </View>
    </View>
  );
}

// ── Chat room row skeleton ─────────────────────────────────────────────────────
export function ChatRoomSkeleton() {
  return (
    <View style={sk.roomRow}>
      <SkeletonBox width={52} height={52} borderRadius={26} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonBox width="55%" height={14} borderRadius={7} />
        <SkeletonBox width="75%" height={11} borderRadius={5} />
      </View>
      <SkeletonBox width={36} height={11} borderRadius={5} />
    </View>
  );
}

// ── Message bubble skeleton ────────────────────────────────────────────────────
export function MessageSkeleton({ isMine = false }: { isMine?: boolean }) {
  return (
    <View style={[sk.msgRow, isMine && sk.msgRowMine]}>
      {!isMine && <SkeletonBox width={28} height={28} borderRadius={14} />}
      <View style={[sk.msgBubble, isMine && sk.msgBubbleMine]}>
        <SkeletonBox width={Math.random() > 0.5 ? 180 : 120} height={13} borderRadius={6} style={{ marginBottom: 4 }} />
        {Math.random() > 0.6 && <SkeletonBox width={100} height={13} borderRadius={6} />}
      </View>
    </View>
  );
}

// ── Notification row skeleton ──────────────────────────────────────────────────
export function NotifSkeleton() {
  return (
    <View style={sk.notifRow}>
      <SkeletonBox width={44} height={44} borderRadius={22} />
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox height={13} width="80%" borderRadius={6} />
        <SkeletonBox height={10} width="30%" borderRadius={5} />
      </View>
    </View>
  );
}

// ── Entry card skeleton (devotion / prayer) ────────────────────────────────────
export function EntrySkeleton() {
  return (
    <View style={sk.entryCard}>
      <SkeletonBox width={80} height={22} borderRadius={11} style={{ marginBottom: 10 }} />
      <SkeletonBox height={16} width="70%" borderRadius={8} style={{ marginBottom: 8 }} />
      <SkeletonBox height={12} style={{ marginBottom: 6 }} />
      <SkeletonBox height={12} width="90%" style={{ marginBottom: 6 }} />
      <SkeletonBox height={12} width="80%" />
    </View>
  );
}

const sk = StyleSheet.create({
  postCard: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: 1,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
    backgroundColor: colors.white,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: spacing.md,
    marginBottom: 6,
  },
  msgRowMine: { flexDirection: 'row-reverse' },
  msgBubble: {
    backgroundColor: colors.parchment,
    borderRadius: 16,
    padding: spacing.sm,
    maxWidth: '70%',
  },
  msgBubbleMine: { backgroundColor: colors.oliveFaint },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.parchmentDark,
    backgroundColor: colors.white,
  },
  entryCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
});
