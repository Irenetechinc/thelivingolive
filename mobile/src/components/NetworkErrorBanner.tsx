/**
 * NetworkErrorBanner — shown inline when the Railway server is unreachable.
 * Drop it just above content areas; pass onRetry to let users dismiss + retry.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii, typography } from '../theme/theme';

interface Props {
  /** Human-readable reason (from catch block) or undefined for generic message */
  message?: string | null;
  onRetry?: () => void;
  /** Whether a retry is in progress */
  retrying?: boolean;
}

export default function NetworkErrorBanner({ message, onRetry, retrying }: Props) {
  const slideAnim = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }).start();
  }, []);

  const isOffline =
    !message ||
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('unreachable') ||
    message.toLowerCase().includes('fetch') ||
    message.toLowerCase().includes('timeout') ||
    message.toLowerCase().includes('connect');

  const displayText = isOffline
    ? "Can't reach the server — check your connection."
    : message ?? "Something went wrong. Please try again.";

  return (
    <Animated.View style={[s.wrap, { transform: [{ translateY: slideAnim }] }]}>
      <View style={s.inner}>
        <Ionicons
          name={isOffline ? 'wifi-outline' : 'alert-circle-outline'}
          size={18}
          color="#fff"
        />
        <Text style={s.text} numberOfLines={2}>{displayText}</Text>
        {onRetry && (
          <Pressable
            style={[s.retryBtn, retrying && s.retryBtnBusy]}
            onPress={onRetry}
            disabled={retrying}
            hitSlop={8}
          >
            <Text style={s.retryText}>{retrying ? '…' : 'Retry'}</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radii.md,
    overflow: 'hidden',
    // shadow
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#B94A48',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  retryBtnBusy: { opacity: 0.6 },
  retryText: { fontSize: 12, fontWeight: '700', color: '#fff' },
});
