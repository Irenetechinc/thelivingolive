import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, shadows } from "../theme/theme";
import { useRecording } from "../context/RecordingContext";
import { navigate } from "../navigation/navigationRef";

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// A small persistent pill, visible on top of every screen in the app,
// whenever a recording is in progress or a clip is transcribing — so the
// user can leave Highlights & Notes (to read a chapter, check a hymn, etc.)
// without losing track of it, and tap back in at any time.
export default function FloatingRecordingWidget() {
  const { isRecording, durationMillis, recordings } = useRecording();
  const transcribing = recordings.some((r) => r.status === "transcribing");
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
  }, [isRecording]);

  if (!isRecording && !transcribing) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable style={styles.pill} onPress={() => navigate("Notes")}>
        <Animated.View
          style={[
            styles.dot,
            isRecording && {
              backgroundColor: colors.danger,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }),
            },
            !isRecording && { backgroundColor: colors.gold },
          ]}
        />
        <Text style={styles.text}>
          {isRecording ? `Recording · ${formatDuration(durationMillis)}` : "Transcribing…"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 70,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.oliveDark,
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    ...shadows.cardLg,
  },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.danger },
  text: { color: colors.white, fontWeight: "700", fontSize: 13 },
});
