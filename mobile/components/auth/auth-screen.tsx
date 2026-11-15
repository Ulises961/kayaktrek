import type { ReactNode } from "react"
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { palette } from "@shared/tokens"

import { BrandLockup } from "../ui/brand-lockup"
import { BrandMark } from "../ui/brand-mark"
import { Screen, Stack } from "../ui/layout"

// The frame sign-in and sign-up share: the ocean hero behind a centred card, and the keyboard
// handling the two forms need.
//
// The card sits in a ScrollView inside a KeyboardAvoidingView rather than in a fixed-height,
// centred View. A centred card is taller than the space left above the keyboard, and the
// first field is the one that ends up under it; here the view shrinks to what the keyboard
// leaves, the card centres in that, and anything taller scrolls. `keyboardShouldPersistTaps`
// keeps the first tap on a button from being spent dismissing the keyboard.
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    // Deep ocean — the mobile-appropriate cut of web's ChartBackdrop (a live Leaflet map
    // behind the auth card, frontend/components/auth/chart-backdrop.tsx): same "the form
    // sits on the sea" idea, without pulling a map SDK and public-route fetch into a
    // static hero. The card is the cartouche.
    <Screen className="bg-ocean-900">
      <HeroBackdrop />

      <KeyboardAvoidingView behavior="padding" style={styles.fill} testID="auth-keyboard-view">
        <ScrollView
          testID="auth-scroll"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          <Stack className="w-full max-w-sm items-center gap-8">
            <BrandLockup size={40} textClassName="text-3xl font-semibold tracking-tight text-ocean-50" />
            {children}
          </Stack>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

// A low-contrast lift off the flat ocean-900 ground: the sea reads deeper at the top and
// opens up toward the horizon, and the compass sits behind the card as texture.
//
// The gradient is drawn with react-native-svg, which is already a dependency (the brand mark
// is SVG), rather than with expo-linear-gradient: same result, one fewer native module.
const WATERMARK_SIZE = 320
const WATERMARK_OPACITY = 0.07

function HeroBackdrop() {
  return (
    // `pointerEvents="none"` is load-bearing, not decoration: this covers the whole
    // screen, so without it every press on the form below lands here instead.
    <View testID="auth-hero" pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="oceanDepth" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.ocean900} />
            <Stop offset="1" stopColor={palette.ocean600} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#oceanDepth)" />
      </Svg>

      <View testID="auth-hero-watermark" style={styles.watermark}>
        <BrandMark size={WATERMARK_SIZE} color={palette.ocean100} opacity={WATERMARK_OPACITY} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
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
