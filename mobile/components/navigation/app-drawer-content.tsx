import Constants from "expo-constants"
import type { DrawerContentComponentProps } from "expo-router/drawer"
import { DrawerContentScrollView, DrawerItemList } from "expo-router/drawer"
import { useEffect, useState } from "react"
import { Pressable, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import type { User } from "@shared/dtos/user"

import { loadMeCache } from "../../lib/db/profile-cache"
import { getMe } from "../../lib/profile/actions"
import { useAuth } from "../../lib/auth/auth-context"
import { Avatar } from "../ui/avatar"
import { Button } from "../ui/button"
import { BrandMark } from "../ui/brand-mark"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// M30 WP0: the default expo-router/drawer content is a bare item list with no brand
// identity, no user context, and no footer — items sit flush under the status bar with
// ~80% dead space below them. This adds a header (brand + signed-in user, fetched via
// `getMe` since `useAuth` only exposes auth status/actions, not profile data — a failed
// fetch just leaves the identity line blank, same best-effort spirit as other screens'
// error handling) and a footer (app version + Sign out, moved here from being embedded
// in the Trips list screen's content).
export function AppDrawerContent(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets()
  const { signOut } = useAuth()
  const [identity, setIdentity] = useState<User | null>(null)

  useEffect(() => {
    let cancelled = false
    getMe()
      // Offline, the record the sweep cached (tier 4) — a name and handle a
      // day old are still the right ones.
      .catch(() => loadMeCache())
      .then((user) => {
        if (!cancelled && user) setIdentity(user)
      })
      .catch(() => {
        // Best effort — the drawer still works with just the brand strip.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <View className="flex-1 bg-card" style={{ paddingTop: insets.top }}>
      <Row className="gap-2 px-5 pt-4">
        <BrandMark size={20} />
        <Text className="text-sm font-semibold tracking-tight text-muted-foreground">
          Kayaktrek
        </Text>
      </Row>

      {/* The user's own identity, not the app's — an avatar makes this read as "you",
          not a second brand lockup stacked under the first (M30 identity pass: the
          drawer previously had no avatar anywhere, just a name/handle text line).
          Tappable: mirrors web's UserMenu (the avatar opens Profile/Settings/Sign out)
          — Profile is no longer its own drawer list item, this row is its entry point.
          Navigates by screen name via the drawer's own `navigation` prop rather than a
          Link href — "(profile)" is a route GROUP, and group segments are stripped from
          the URL, so there's no guaranteed literal path string to link to; this is the
          same mechanism DrawerItemList itself uses under the hood. */}
      {identity && (
        <Pressable
          testID="drawer-identity"
          onPress={() => {
            props.navigation.navigate("(profile)")
            props.navigation.closeDrawer()
          }}
        >
          <Row className="items-center gap-3 border-b border-border px-5 pt-3 pb-4">
            <Avatar
              name={identity.name}
              surname={identity.surname}
              imageUrl={identity.avatarUrl}
              size={44}
            />
            <Stack className="flex-1 gap-0.5">
              <Text className="font-semibold" numberOfLines={1}>
                {identity.name} {identity.surname ?? ""}
              </Text>
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                @{identity.username}
              </Text>
            </Stack>
          </Row>
        </Pressable>
      )}

      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 8 }}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View
        className="gap-3 border-t border-border px-5 pt-4"
        style={{ paddingBottom: insets.bottom + 16 }}
      >
        <Text className="text-xs text-muted-foreground">
          Kayaktrek v{Constants.expoConfig?.version ?? "—"}
        </Text>
        <Button variant="outline" onPress={signOut} testID="sign-out">
          Sign out
        </Button>
      </View>
    </View>
  )
}
