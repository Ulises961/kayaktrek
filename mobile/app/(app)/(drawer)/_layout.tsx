import { Drawer } from "expo-router/drawer"
import { BookOpen, Sailboat, UserRound, Users } from "lucide-react-native"

import { palette } from "@shared/tokens"

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
      screenOptions={{
        headerShown: false,
        drawerActiveTintColor: palette.ocean700,
        drawerInactiveTintColor: palette.ocean500,
      }}
    >
      <Drawer.Screen
        name="(trips)"
        options={{
          drawerLabel: "Trips",
          drawerIcon: ({ color, size }) => <Sailboat color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="(logs)"
        options={{
          drawerLabel: "Logs",
          drawerIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="(paddlers)"
        options={{
          drawerLabel: "Paddlers",
          drawerIcon: ({ color, size }) => <Users color={color} size={size} />,
        }}
      />
      <Drawer.Screen
        name="(profile)"
        options={{
          drawerLabel: "Profile",
          drawerIcon: ({ color, size }) => <UserRound color={color} size={size} />,
        }}
      />
    </Drawer>
  )
}
