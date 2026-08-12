// "Living Olive" design language: Illuminated Manuscript
// Concept — a beautifully printed devotional opened at golden hour.
// Organic olive tones, warm parchment, terracotta fire, generous whitespace.

export const colors = {
  // Primary palette
  olive: "#5B6B45",
  oliveDark: "#3E4A2F",
  oliveMid: "#4A5A36",
  oliveLight: "#8A9A6B",
  oliveFaint: "#D4DCCA",

  // Parchment
  parchment: "#F7F1E3",
  parchmentMid: "#F0E8D0",
  parchmentDark: "#E2D5B5",

  // Accents
  terracotta: "#C1693A",
  terracottaLight: "#D4845A",
  gold: "#C9A227",
  goldLight: "#E2C060",

  // Ink
  ink: "#2B2A25",
  inkSoft: "#5C5A4E",
  inkFaint: "#9A9485",

  // Utility
  white: "#FFFFFF",
  danger: "#B3452C",
  highlightYellow: "#F6E3A1",
  highlightGreen: "#C8DDB4",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const radii = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
};

export const typography = {
  display: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -0.8, lineHeight: 40 },
  title: { fontSize: 24, fontWeight: "700" as const, letterSpacing: -0.4, lineHeight: 30 },
  subtitle: { fontSize: 17, fontWeight: "600" as const, letterSpacing: -0.2, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 26 },
  bodySmall: { fontSize: 14, fontWeight: "400" as const, lineHeight: 22 },
  caption: { fontSize: 12, fontWeight: "500" as const, letterSpacing: 0.6 },
  micro: { fontSize: 10, fontWeight: "600" as const, letterSpacing: 1.2 },
};

export const shadows = {
  card: {
    shadowColor: "#1A1A0E",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardLg: {
    shadowColor: "#1A1A0E",
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  subtle: {
    shadowColor: "#1A1A0E",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
};

export const gradients = {
  olive: [colors.oliveDark, colors.olive] as string[],
  oliveDeep: ["#2E3A1F", colors.oliveDark, colors.olive] as string[],
  oliveToParchment: [colors.oliveDark, colors.olive, colors.parchment] as string[],
  parchment: [colors.parchment, colors.parchmentMid] as string[],
  terracotta: [colors.terracotta, colors.terracottaLight] as string[],
  gold: [colors.gold, colors.goldLight] as string[],
  header: ["#2E3A1F", "#3E4A2F", "#4A5A36"] as string[],
};
