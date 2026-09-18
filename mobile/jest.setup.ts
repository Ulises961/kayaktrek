// react-native-safe-area-context's own recommended jest setup (its README): the real
// module's useSafeAreaInsets() throws without a mounted <SafeAreaProvider>, which no
// screen test wraps for (production gets one for free from app/_layout.tsx). The
// package ships this mock precisely for that gap.
// mock.tsx is a TS default-export module; compiled it's `{ __esModule, default }`, not
// the named exports (useSafeAreaInsets, etc.) our code imports — unwrap `.default`.
jest.mock("react-native-safe-area-context", () => {
  // jest.mock factories must require() inline; babel-plugin-jest-hoist forbids
  // referencing outer imports here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mock = require("react-native-safe-area-context/jest/mock")
  return mock.default ?? mock
})

// Screens set their own Stack title via `<Stack.Screen options={...} />` rendered
// inline (see (app)/_layout.tsx's comment on why) — that calls useRoute() under the
// hood, which throws "Couldn't find a route object" without a real navigator, and
// none of these screen tests mount one. Stub it inert; tests assert screen content,
// not the native header title.
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router")
  return { ...actual, Stack: Object.assign(actual.Stack, { Screen: () => null }) }
})

// expo-router/drawer transitively requires react-native-drawer-layout ->
// react-native-reanimated -> react-native-worklets, which tries to load a native
// module jest has no binding for ("Cannot read properties of undefined (reading
// 'loadUnpackers')") the moment the module graph is required — even when the
// component it exports is never rendered. Stub the whole module: no screen test
// needs the real Drawer, only the DrawerToggleButton some screens reference in a
// Stack.Screen's headerLeft (M9i WP0).
jest.mock("expo-router/drawer", () => ({
  DrawerToggleButton: () => null,
}))

// react-native-gesture-handler's own package (used directly since M9l WP4's
// ScrollView, and already a transitive dependency via reanimated) ships this exact
// setup file for RN Testing Library: without it, importing its `GestureComponents`
// module (which the *legacy* ScrollView/FlatList/etc. are built on) drags in RN's
// real TextInput, which react-native-css's own Text/TextInput jest interception
// can't handle ("Cannot convert undefined or null to object" in
// copyComponentProperties).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native-gesture-handler/jestSetup")

// The package's own jestSetup.js only mocks the *legacy* GestureComponents module
// (`./src/components/GestureComponents`) — v3's modern ScrollView (the one M9l WP4
// uses, from `react-native-gesture-handler`'s top-level export) lives in a separate
// `./src/v3/components/GestureComponents` file wrapping a real gesture detector,
// which throws ("GestureDetector must be used as a descendant of
// GestureHandlerRootView") without a mounted root view none of these component
// tests provide. Standing in the same plain-RN-component mock the package's own
// legacy mock uses (`src/mocks/gestureComponents.tsx`) sidesteps that: the tests
// exercising this exercise our own content/logic, not RNGH's native gesture
// composition, which is a real-device-only concern (see weather-hour-grid.tsx's
// comment on why plain ScrollView doesn't work while nested in gorhom's sheet).
// Mocked at its compiled `lib/module` path, not `src` — bare `require("react-native-gesture-handler")`
// resolves to `lib/module/index.js` in this jest environment (no react-native-platform
// resolver active), confirmed via require.resolve; the package's own jestSetup.js mocks
// both trees for the legacy module but only ships the v3 one it doesn't cover here.
jest.mock("react-native-gesture-handler/lib/module/v3/components/GestureComponents", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FlatList, RefreshControl, ScrollView, Switch, TextInput } = require("react-native")
  return { __esModule: true, FlatList, RefreshControl, ScrollView, Switch, TextInput }
})
