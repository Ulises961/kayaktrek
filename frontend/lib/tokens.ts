/**
 * Design tokens — single source of truth for the Kayak Expedition Planner design system.
 *
 * Web (Next.js): CSS custom properties in globals.css mirror these values.
 * Mobile (React Native, M9): import this file directly in StyleSheet definitions.
 *
 * Color values are hex strings for maximum React Native compatibility.
 * The web CSS uses oklch equivalents for perceptual uniformity; keep both in sync when updating.
 */

// ---------------------------------------------------------------------------
// Palette — raw named colors (not semantic)
// ---------------------------------------------------------------------------
export const palette = {
  // Ocean blues
  ocean950: "#060f1c",
  ocean900: "#0d1b2e",
  ocean800: "#122540",
  ocean700: "#1a3554",
  ocean600: "#1a5c9a",
  ocean500: "#2272b6",
  ocean400: "#4fa8d4",
  ocean300: "#7ec4e4",
  ocean200: "#b3dcf0",
  ocean100: "#dbedf7",
  ocean50: "#f0f8fd",

  // Sea foam / teal
  foam400: "#2aa8a0",
  foam300: "#4bbdb5",
  foam200: "#a7deda",
  foam100: "#d4f0ee",

  // Sunset / amber
  sunset600: "#b45309",
  sunset500: "#d97706",
  sunset400: "#f59e0b",
  sunset300: "#fcd34d",
  sunset100: "#fef3c7",

  // Chart paper — warm ivory, scoped to the landing nautical-chart variant
  // (cartouche, scale-bar, route halo). The only net-new color the variant adds.
  chartPaper: "#f7f4ec",

  // Neutral slate
  slate950: "#020617",
  slate900: "#0f172a",
  slate800: "#1e293b",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",

  // Semantic system
  red600: "#dc2626",
  red400: "#f87171",
  green700: "#065f46",
  green400: "#34d399",
  green100: "#d1fae5",
  blue700: "#1d4ed8",
  blue400: "#60a5fa",
  blue100: "#dbeafe",
} as const

// ---------------------------------------------------------------------------
// Semantic tokens — light mode
// ---------------------------------------------------------------------------
export const lightTokens = {
  background: palette.slate50,
  foreground: palette.ocean900,

  card: "#ffffff",
  cardForeground: palette.ocean900,

  popover: "#ffffff",
  popoverForeground: palette.ocean900,

  primary: palette.ocean600,
  primaryForeground: palette.slate50,

  secondary: palette.ocean100,
  secondaryForeground: palette.ocean700,

  muted: palette.ocean50,
  mutedForeground: palette.ocean500,

  accent: palette.sunset500,
  accentForeground: palette.ocean900,

  destructive: palette.red600,
  destructiveForeground: palette.slate50,

  border: palette.ocean200,
  input: palette.ocean200,
  ring: palette.ocean500,

  // Sidebar
  sidebar: palette.ocean50,
  sidebarForeground: palette.ocean900,
  sidebarPrimary: palette.ocean600,
  sidebarPrimaryForeground: palette.slate50,
  sidebarAccent: palette.ocean100,
  sidebarAccentForeground: palette.ocean800,
  sidebarBorder: palette.ocean200,
  sidebarRing: palette.ocean500,

  // Trip state badges
  stateDraftBg: palette.slate200,
  stateDraftFg: palette.slate600,
  statePlanningBg: palette.blue100,
  statePlanningFg: palette.blue700,
  stateHappeningBg: palette.green100,
  stateHappeningFg: palette.green700,
  statePastBg: palette.slate200,
  statePastFg: palette.slate500,
} as const

// ---------------------------------------------------------------------------
// Semantic tokens — dark mode
// ---------------------------------------------------------------------------
export const darkTokens = {
  background: palette.ocean900,
  foreground: palette.ocean50,

  card: palette.ocean800,
  cardForeground: palette.ocean50,

  popover: palette.ocean800,
  popoverForeground: palette.ocean50,

  primary: palette.ocean400,
  primaryForeground: palette.ocean900,

  secondary: palette.ocean700,
  secondaryForeground: palette.ocean50,

  muted: palette.ocean800,
  mutedForeground: palette.ocean300,

  accent: palette.sunset400,
  accentForeground: palette.ocean900,

  destructive: palette.red400,
  destructiveForeground: palette.ocean900,

  border: "rgba(255,255,255,0.10)",
  input: "rgba(255,255,255,0.12)",
  ring: palette.ocean400,

  // Sidebar
  sidebar: palette.ocean800,
  sidebarForeground: palette.ocean50,
  sidebarPrimary: palette.ocean400,
  sidebarPrimaryForeground: palette.ocean900,
  sidebarAccent: palette.ocean700,
  sidebarAccentForeground: palette.ocean50,
  sidebarBorder: "rgba(255,255,255,0.08)",
  sidebarRing: palette.ocean400,

  // Trip state badges
  stateDraftBg: palette.slate800,
  stateDraftFg: palette.slate400,
  statePlanningBg: palette.ocean700,
  statePlanningFg: palette.blue400,
  stateHappeningBg: "#064e3b",
  stateHappeningFg: palette.green400,
  statePastBg: palette.slate800,
  statePastFg: palette.slate500,
} as const

// ---------------------------------------------------------------------------
// Spacing scale (React Native uses numbers, web uses rem)
// ---------------------------------------------------------------------------
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------
export const radius = {
  sm: 4,
  md: 6,
  lg: 10, // --radius base
  xl: 14,
  full: 9999,
} as const

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------
export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const

// ---------------------------------------------------------------------------
// Convenience export for React Native usage
// ---------------------------------------------------------------------------
export const tokens = {
  light: lightTokens,
  dark: darkTokens,
  palette,
  spacing,
  radius,
  fontSize,
  fontWeight,
} as const
