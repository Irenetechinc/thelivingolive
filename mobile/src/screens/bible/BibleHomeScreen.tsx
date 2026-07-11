import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/AppNavigator";
import { colors, radii, spacing, typography } from "../../theme/theme";

type Props = NativeStackScreenProps<RootStackParamList, "BibleHome">;

export default function BibleHomeScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.version}>Version: KJV (King James Version)</Text>
      <Text style={styles.hint}>
        NIV, NLT, ESV & NABRE require licensed text APIs and will be added once those
        licenses are connected.
      </Text>

      <Pressable style={styles.primary} onPress={() => navigation.navigate("BookPicker")}>
        <Text style={styles.primaryText}>Start reading</Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={() => navigation.navigate("Notes")}>
        <Text style={styles.secondaryText}>My highlights & notes</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment, padding: spacing.lg },
  version: { ...typography.subtitle, color: colors.oliveDark, marginTop: spacing.md },
  hint: { ...typography.caption, color: colors.inkSoft, marginTop: spacing.xs, marginBottom: spacing.lg },
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
