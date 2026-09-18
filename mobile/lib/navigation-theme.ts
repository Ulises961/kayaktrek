import { lightTokens, palette } from "@shared/tokens"

/**
 * Shared `screenOptions` for every group's `Stack` (M30 WP1).
 *
 * Each screen still sets its own `title` from inside its own file — declaring a
 * `<Stack.Screen name="...">` in a layout for a route the file-based router
 * already registers duplicate-registers it and silently breaks navigation there
 * (M9b). That leaves the header's *appearance* with no other home than this.
 *
 * Mirrors web's `.chart-header-app`: the app's own paper background and a
 * separation that is a rule rather than a drop shadow. The native default —
 * an oversized black system title on plain white — is what every group rendered
 * before this existed.
 */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: lightTokens.background },
  // Ink, not a tint: the same reasoning the drawer's rest state uses — a coloured
  // title on every screen reads as a page of link text rather than a heading.
  headerTitleStyle: { color: lightTokens.foreground, fontWeight: "600" as const },
  // The back chevron and any header action, which *are* controls and do take colour.
  headerTintColor: palette.ocean700,
  headerShadowVisible: false,
}
