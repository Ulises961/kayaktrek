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
