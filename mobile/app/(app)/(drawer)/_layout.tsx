import { Drawer } from "expo-router/drawer"
import { Kayak, Newspaper, Settings } from "lucide-react-native"

import { palette } from "@shared/tokens"

import { UserGroupIcon } from "../../../components/icons/heroicons-user-group"
import { AppDrawerContent } from "../../../components/navigation/app-drawer-content"

// KNOWN ISSUE (M30 WP0, unresolved): login was landing on Logs instead of Trips —
// Expo Router resolves a route group's initial screen from `unstable_settings.anchor`/
// `initialRouteName` (getRoutesCore.js) when routes are auto-generated, but this layout
// declares all 4 screens explicitly via <Drawer.Screen>, and useScreens.js's
// getSortedChildren only consults that anchor for auto-generated "leftover" screens —
// with an explicit list it orders purely by JSX declaration order (already (trips)
// first) and never feeds the anchor into the real navigator's `initialRouteName` prop.
// Both fixes below are the textbook-correct API per Expo Router's docs, confirmed
// loaded at runtime (module evaluates, unstable_settings has the right value), but the
// app still opens on Logs on a fresh install + fresh login. Left in place since they're
// the semantically-correct fix and harmless; the actual default-tab behavior needs a
// follow-up investigation (possibly an expo-router 57.0.19-specific regression) rather
// than a workaround bolted on here.
export const unstable_settings = {
  initialRouteName: "(trips)",
}

// A drawer, not a bottom tab bar (M9i WP0, plans/M9i.md, decided 2026-09-06) — the
// destination count won't stay small: logs, buddies, inventory, settings, and M9j's
// voice-control affordance are all plausible top-level entries, and a tab bar degrades
// past ~5 items while a drawer scales cleanly.
//
// `headerShown: false` here deliberately — each Drawer.Screen's `name` is a route
// GROUP folder ((trips)/(logs)/(profile)), and each group owns its own nested Stack
// (see (trips)/_layout.tsx) which already renders a header with per-screen dynamic
// titles ("Trip destination name", a log's date, a paddler's username). Leaving the
// Drawer's own header shown as well would stack two headers. Each group's root screen
// (index.tsx) adds the menu button itself via `DrawerToggleButton` in its own
// `Stack.Screen options.headerLeft` — a pushed screen deeper in that group's stack
// gets a back button instead, which is the only affordance it needs.
export default function DrawerLayout() {
  return (
    <Drawer
      initialRouteName="(trips)"
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        // Mirrors web's SidebarMenuButton exactly: rest state is plain ink
        // (--sidebar-foreground/ocean900), not a tinted colour — a whole nav list in
        // ocean500 read as a page of link text (M30 identity pass). Only the active
        // item gets colour, via a `--sidebar-accent` pill (ocean100 bg, ocean700 text).
        drawerActiveTintColor: palette.ocean700,
        drawerInactiveTintColor: palette.ocean900,
        drawerActiveBackgroundColor: palette.ocean100,
      }}
    >
      <Drawer.Screen
        name="(trips)"
        options={{
          drawerLabel: "Trips",
          // Matches web's navigation-items.tsx icon-for-icon (KayakIcon), not lucide's
          // generic Sailboat — the same nav item should be the same glyph on both
          // platforms (M30 identity pass).
          drawerIcon: ({ color, size }) => <Kayak color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="(logs)"
        options={{
          drawerLabel: "Logs",
          drawerIcon: ({ color, size }) => <Newspaper color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="(paddlers)"
        options={{
          drawerLabel: "Paddlers",
          // Web's UserGroupIcon is a Heroicons SVG, not a lucide icon — ported verbatim
          // rather than substituted with lucide's Users (a visibly different glyph).
          drawerIcon: ({ color, size }) => <UserGroupIcon color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="(settings)"
        options={{
          drawerLabel: "Settings",
          drawerIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
      {/* Profile is no longer a drawer list item — tapping the identity row in
          AppDrawerContent's header (avatar + name) navigates here instead, mirroring
          web's UserMenu (avatar → Profile/Settings/Sign out) rather than listing Profile
          as a peer of Trips/Logs/Paddlers. Still a real Drawer.Screen (not just a route)
          so it keeps its own drawerLabel/title machinery — `display: "none"` hides it
          from the rendered list without unregistering the route. */}
      <Drawer.Screen name="(profile)" options={{ drawerItemStyle: { display: "none" } }} />
    </Drawer>
  )
}
