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

  // Sand — the app's own warm-neutral paper white, one step lighter and less saturated
  // than chartPaper (which stays scoped to chart furniture). Matches web's
  // globals.css `--background` (oklch(0.986 0.007 88)), which M12 §E nudged toward
  // chart-paper's warmth — this is the hex equivalent that never made it back here.
  sand: "#fcfbf7",

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
// Every entry below that isn't a bare `palette.*` reference was audited
// 2026-09-12 against globals.css's actual `:root` oklch values (not the "#hex
// palette-name" glosses in that file's own comments, which drift from what the
// oklch really renders — confirmed by round-tripping each conversion). The
// palette's named swatches (ocean600, sunset500, etc.) are real colors used
// elsewhere on their own terms; they just don't happen to equal these specific
// CSS custom properties, so referencing them here was silently wrong the whole
// time mobile has existed. Regenerate theme.generated.css after touching this.
export const lightTokens = {
  background: palette.sand,
  foreground: "#000d1c", // oklch(0.155 0.04 245) — palette.ocean900 read 0d1b2e, visibly lighter
  cardForeground: "#000d1c",

  card: "#ffffff",
  popover: "#ffffff",
  popoverForeground: "#000d1c",

  primary: "#0053a1", // oklch(0.43 0.165 243) — palette.ocean600 (1a5c9a) is a different, lighter blue
  primaryForeground: "#f5fbfe",

  secondary: "#cceef7", // oklch(0.928 0.038 215) — palette.ocean100 (dbedf7) is close but not equal
  secondaryForeground: "#002b4f", // oklch(0.28 0.085 243) — palette.ocean700 (1a3554) reads lighter/less saturated

  // oklch(0.965 0.006 90) — a warm near-neutral, NOT palette.ocean50 (f0f8fd),
  // which is blue. The muted *background* had the same hue error the muted-text
  // fix below corrects for foreground.
  muted: "#f5f3ef",
  mutedForeground: "#456e8b", // oklch(0.52 0.065 240) — its low (0.065) chroma renders far more desaturated than palette.ocean500 (2272b6)

  // The call to action. Sunset, and deliberately rare — creating a trip, a log, a
  // checklist item; mirrors web's `--cta` (frontend/components/common/button-roles.ts).
  // Split from `accent` (2026-09-12): `accent` used to double as both "the amber CTA"
  // and shadcn's own quiet hover-surface, which is not what web's globals.css means by
  // it anymore. `cta` is the only amber token now.
  cta: "#dc9822", // oklch(0.73 0.145 75) — a lighter, more yellow amber than palette.sunset500 (d97706)
  ctaForeground: "#000d1c",

  // Shadcn's own meaning: the quiet surface a hovered or highlighted row sits on. Same
  // value as `secondary` by construction, matching web's globals.css.
  accent: "#cceef7",
  accentForeground: "#002b4f",

  destructive: "#e7000b", // oklch(0.577 0.245 27.325) — a more vivid red-orange than palette.red600 (dc2626)
  destructiveForeground: palette.slate50,

  border: "#b5dae5", // oklch(0.865 0.042 218) — close to palette.ocean200 (b3dcf0) but not equal
  input: "#b5dae5",
  ring: "#456e8b", // same oklch as mutedForeground

  // Sidebar
  sidebar: "#f5f3ef", // same oklch as muted
  sidebarForeground: "#000d1c",
  sidebarPrimary: "#0053a1",
  sidebarPrimaryForeground: "#f5fbfe",
  sidebarAccent: "#cceef7",
  sidebarAccentForeground: "#00182d", // oklch(0.2 0.055 243) — its own distinct value, not accentForeground's
  sidebarBorder: "#b5dae5",
  sidebarRing: "#456e8b",

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
  background: "#000d1c", // oklch(0.155 0.04 245) — same value light's --foreground uses; palette.ocean900 (0d1b2e) reads lighter
  foreground: "#f5fbfe", // oklch(0.985 0.008 220) — palette.ocean50 (f0f8fd) is close but not equal

  card: "#021526", // oklch(0.19 0.044 247) — notably darker/more saturated than palette.ocean800 (122540)
  cardForeground: "#f5fbfe",

  popover: "#021526",
  popoverForeground: "#f5fbfe",

  primary: "#009bc5", // oklch(0.64 0.125 225) — a richer teal-blue than palette.ocean400 (4fa8d4)
  primaryForeground: "#000d1c",

  secondary: "#002843", // oklch(0.265 0.068 243) — darker/more saturated than palette.ocean700 (1a3554)
  secondaryForeground: "#f5fbfe",

  muted: "#021526", // same oklch as card
  // Same correction as lightTokens: oklch(0.73 0.06 225)'s actual sRGB output,
  // not the ocean-300 hex its globals.css comment claims.
  mutedForeground: "#7fb0c4",

  cta: "#e4a40f", // oklch(0.76 0.155 80) — darker/richer than palette.sunset400 (f59e0b)
  ctaForeground: "#000d1c",

  accent: "#002843", // same oklch as secondary
  accentForeground: "#f5fbfe",

  destructive: "#f94144", // oklch(0.65 0.22 25) — more saturated/orange-red than palette.red400 (f87171)
  destructiveForeground: palette.ocean900,

  border: "rgba(255,255,255,0.10)",
  input: "rgba(255,255,255,0.12)",
  ring: "#009bc5", // same oklch as primary

  // Sidebar
  sidebar: "#021526",
  sidebarForeground: "#f5fbfe",
  sidebarPrimary: "#009bc5",
  sidebarPrimaryForeground: "#000d1c",
  sidebarAccent: "#002843",
  sidebarAccentForeground: "#f5fbfe",
  sidebarBorder: "rgba(255,255,255,0.08)",
  sidebarRing: "#009bc5",

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
