import { Redirect } from "expo-router"
import { useState } from "react"
import { StyleSheet, View } from "react-native"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { palette } from "@shared/tokens"

import { BrandLockup } from "../../components/ui/brand-lockup"
import { BrandMark } from "../../components/ui/brand-mark"
import { Button } from "../../components/ui/button"
import { Card } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Screen, Stack } from "../../components/ui/layout"
import { Text } from "../../components/ui/text"
import { useAuth } from "../../lib/auth/auth-context"

// Once signed in, expo-router's file-based routing takes over the redirect — no
// navigation call needed here, just render <Redirect>, same pattern as (app)/_layout.tsx.
export default function LoginScreen() {
  const { status, signIn } = useAuth()
  const [mail, setMail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  if (status === "authenticated") {
    return <Redirect href="/" />
  }

  async function handleSubmit() {
    setError(null)
    setIsPending(true)
    const result = await signIn(mail, password)
    setIsPending(false)
    if (!result.success) setError(result.error)
  }

  return (
    // Deep ocean — the mobile-appropriate cut of web's ChartBackdrop (a live Leaflet map
    // behind the auth card, frontend/components/auth/chart-backdrop.tsx): same "the form
    // sits on the sea" idea, without pulling a map SDK and public-route fetch into a
    // static hero. The card below is the cartouche.
    //
    // The gradient is drawn with react-native-svg, which is already a dependency (the
    // brand mark is SVG), rather than with expo-linear-gradient as plans/M30-*.md WP1
    // suggested. Same result, one fewer native module — and no dev-client rebuild, so
    // this ships as a JS-only change.
    <Screen className="items-center justify-center bg-ocean-900 p-6">
      <HeroBackdrop />

      <Stack className="w-full max-w-sm items-center gap-8">
        <BrandLockup size={40} textClassName="text-3xl font-semibold tracking-tight text-ocean-50" />

        <Card className="w-full gap-6 p-6">
          <Text className="text-2xl font-semibold">Sign in</Text>

          <Stack className="gap-1.5">
            <Label>Email</Label>
            <Input
              value={mail}
              onChangeText={setMail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              testID="login-email"
            />
          </Stack>

          <Stack className="gap-1.5">
            <Label>Password</Label>
            <Input
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              testID="login-password"
            />
          </Stack>

          {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

          <Button onPress={handleSubmit} disabled={isPending} testID="login-submit">
            {isPending ? "Signing in…" : "Sign in"}
          </Button>
        </Card>
      </Stack>
    </Screen>
  )
}

// A low-contrast lift off the flat ocean-900 ground: the sea reads deeper at the top and
// opens up toward the horizon, and the compass sits behind the card as texture.
const WATERMARK_SIZE = 320
const WATERMARK_OPACITY = 0.07

function HeroBackdrop() {
  return (
    // `pointerEvents="none"` is load-bearing, not decoration: this covers the whole
    // screen, so without it every press on the form below lands here instead.
    <View testID="login-hero" pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="oceanDepth" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.ocean900} />
            <Stop offset="1" stopColor={palette.ocean600} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#oceanDepth)" />
      </Svg>

      <View testID="login-hero-watermark" style={styles.watermark}>
        <BrandMark size={WATERMARK_SIZE} color={palette.ocean100} opacity={WATERMARK_OPACITY} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  watermark: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
})
