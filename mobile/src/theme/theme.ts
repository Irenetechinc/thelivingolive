// "Living Olive" visual concept: a warm olive-grove palette (deep olive, sun-bleached
// parchment, terracotta accent) evoking scripture read outdoors at golden hour —
// grounded and organic rather than a generic "church app blue".
export const colors = {
  olive: "#5B6B45",
  oliveDark: "#3E4A2F",
  oliveLight: "#8A9A6B",
  parchment: "#F7F1E3",
  parchmentDark: "#EDE3CB",
  terracotta: "#C1693A",
  ink: "#2B2A25",
  inkSoft: "#5C5A4E",
  gold: "#C9A227",
  white: "#FFFFFF",
  danger: "#B3452C",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const typography = {
  display: { fontSize: 32, fontWeight: "700" as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700" as const },
  subtitle: { fontSize: 16, fontWeight: "600" as const },
  body: { fontSize: 16, fontWeight: "400" as const, lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: "500" as const },
};
