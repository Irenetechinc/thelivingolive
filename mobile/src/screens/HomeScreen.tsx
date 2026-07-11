import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing, typography } from "../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

const cards: {
  key: keyof RootStackParamList;
  title: string;
  description: string;
  glyph: string;
  tint: string;
}[] = [
  { key: "BibleHome", title: "Bible", description: "Read, highlight & study scripture", glyph: "📖", tint: colors.olive },
  { key: "HymnsList", title: "Hymns", description: "Browse the digital hymnbook", glyph: "🎵", tint: colors.terracotta },
  { key: "Devotions", title: "Daily Devotions", description: "AI-guided devotionals for your goals", glyph: "🌅", tint: colors.gold },
  { key: "Prayer", title: "Prayer Points", description: "Bible-rooted prayers for your desires", glyph: "🙏", tint: colors.oliveDark },
];

function AnimatedCard({ index, children }: { index: number; children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      delay: index * 90,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function HomeScreen({ navigation }: Props) {
  const { signOut } = useAuth();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Welcome back</Text>
          <Text style={styles.title}>The Living Olive</Text>
        </View>
        <Pressable onPress={signOut} hitSlop={12}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {cards.map((card, index) => (
        <AnimatedCard key={card.key} index={index}>
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            onPress={() => navigation.navigate(card.key as any)}
          >
            <View style={[styles.iconWrap, { backgroundColor: card.tint }]}>
              <Text style={styles.icon}>{card.glyph}</Text>
            </View>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardDescription}>{card.description}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </AnimatedCard>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.lg,
  },
  eyebrow: { ...typography.caption, color: colors.oliveLight, textTransform: "uppercase" },
  title: { ...typography.display, color: colors.oliveDark },
  signOut: { color: colors.terracotta, fontWeight: "600" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  icon: { fontSize: 24 },
  cardText: { flex: 1 },
  cardTitle: { ...typography.subtitle, color: colors.ink, fontSize: 18 },
  cardDescription: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  chevron: { fontSize: 26, color: colors.oliveLight },
});
