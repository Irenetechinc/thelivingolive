import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radii, spacing, typography } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "BibleHome">;

export type BibleVersion = "KJV" | "WEB" | "ASV";

const VERSIONS: { id: BibleVersion; label: string; description: string }[] = [
  { id: "KJV", label: "KJV", description: "King James Version (1611)" },
  { id: "WEB", label: "WEB", description: "World English Bible (modern)" },
  { id: "ASV", label: "ASV", description: "American Standard Version (1901)" },
];

const VERSION_PREF_KEY = "bible:preferred_version";

export default function BibleHomeScreen({ navigation }: Props) {
  const [version, setVersion] = useState<BibleVersion>("KJV");

  useEffect(() => {
    AsyncStorage.getItem(VERSION_PREF_KEY).then((v) => {
      if (v && VERSIONS.find((x) => x.id === v)) setVersion(v as BibleVersion);
    });
  }, []);

  function selectVersion(v: BibleVersion) {
    setVersion(v);
    AsyncStorage.setItem(VERSION_PREF_KEY, v);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.sectionLabel}>Choose your Bible version</Text>
      <View style={styles.versionList}>
        {VERSIONS.map((v) => (
          <Pressable
            key={v.id}
            style={[styles.versionRow, version === v.id && styles.versionRowActive]}
            onPress={() => selectVersion(v.id)}
          >
            <View style={styles.versionRowText}>
              <Text style={[styles.versionId, version === v.id && styles.versionIdActive]}>
                {v.label}
              </Text>
              <Text style={styles.versionDesc}>{v.description}</Text>
            </View>
            {version === v.id && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
        ))}
      </View>

      <Pressable
        style={styles.primary}
        onPress={() => navigation.navigate("BookPicker", { version })}
      >
        <Text style={styles.primaryText}>Read the Bible ({version})</Text>
      </Pressable>

      <Pressable
        style={styles.secondary}
        onPress={() => navigation.navigate("Notes")}
      >
        <Text style={styles.secondaryText}>My highlights & notes</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  sectionLabel: {
    ...typography.caption,
    color: colors.oliveLight,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  versionList: { marginBottom: spacing.lg },
  versionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 2,
    borderColor: "transparent",
  },
  versionRowActive: { borderColor: colors.olive },
  versionRowText: { flex: 1 },
  versionId: { ...typography.subtitle, color: colors.ink, fontSize: 16 },
  versionIdActive: { color: colors.oliveDark, fontWeight: "700" },
  versionDesc: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  checkmark: { color: colors.olive, fontSize: 20, fontWeight: "700" },
  primary: {
    backgroundColor: colors.olive,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.md,
  },
  primaryText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  secondary: {
    backgroundColor: colors.white,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.parchmentDark,
  },
  secondaryText: { color: colors.oliveDark, fontWeight: "600", fontSize: 16 },
});
