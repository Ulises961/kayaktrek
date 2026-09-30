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
  const mock = require("react-native-safe-area-context/jest/mock");
  return mock.default ?? mock;
});

// Screens set their own Stack title via `<Stack.Screen options={...} />` rendered
// inline (see (app)/_layout.tsx's comment on why) — that calls useRoute() under the
// hood, which throws "Couldn't find a route object" without a real navigator, and
// none of these screen tests mount one. Stub it inert; tests assert screen content,
// not the native header title.
// useIsFocused reads the navigator the same way, and throws without one. A screen
// under test is the one in front, so it is focused — OfflineNotice keys on it to
// report only the focused screen's cached data to the banner.
jest.mock("expo-router", () => {
  const actual = jest.requireActual("expo-router");
  return {
    ...actual,
    Stack: Object.assign(actual.Stack, { Screen: () => null }),
    useIsFocused: () => true,
  };
});

// The package's own jest mock (online, reachable). Screen tests now render the
// app-root OfflineBanner through test-utils/with-offline-banner.tsx, which reads
// connectivity; tests about connectivity itself still mock this per file.
jest.mock("@react-native-community/netinfo", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-community/netinfo/jest/netinfo-mock.js"),
);

// expo-router/drawer transitively requires react-native-drawer-layout ->
// react-native-reanimated -> react-native-worklets, which tries to load a native
// module jest has no binding for ("Cannot read properties of undefined (reading
// 'loadUnpackers')") the moment the module graph is required — even when the
// component it exports is never rendered. Stub the whole module: no screen test
// needs the real Drawer, only the DrawerToggleButton some screens reference in a
// Stack.Screen's headerLeft (M9i WP0).
jest.mock("expo-router/drawer", () => ({
  DrawerToggleButton: () => null,
}));

// react-native-gesture-handler's own package (used directly since M9l WP4's
// ScrollView, and already a transitive dependency via reanimated) ships this exact
// setup file for RN Testing Library: without it, importing its `GestureComponents`
// module (which the *legacy* ScrollView/FlatList/etc. are built on) drags in RN's
// real TextInput, which react-native-css's own Text/TextInput jest interception
// can't handle ("Cannot convert undefined or null to object" in
// copyComponentProperties).
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native-gesture-handler/jestSetup");

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
jest.mock(
  "react-native-gesture-handler/lib/module/v3/components/GestureComponents",
  () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      FlatList,
      RefreshControl,
      ScrollView,
      Switch,
      TextInput,
    } = require("react-native");
    /* eslint-enable @typescript-eslint/no-require-imports */
    return {
      __esModule: true,
      FlatList,
      RefreshControl,
      ScrollView,
      Switch,
      TextInput,
    };
  },
);

// M34: babel-preset-expo rewrites our own `import { Image } from "react-native"`
// (components/trips/photo-carousel.tsx, components/ui/avatar.tsx) into
// `react-native-css/components/Image` — which jest-expo's `customExportConditions:
// ["react-native"]` resolves to the package's raw, untranspiled source
// (`react-native-css/src/components/Image.tsx`, confirmed against its package.json
// exports map: `"./components/*"`'s `"react-native"` condition points there, same as
// Text/View/etc.). That file's own `import { Image as RNImage } from "react-native"`
// then hits react-native's real lazy `Image` getter, which under
// `@react-native/jest-preset`'s automock requires this exact same react-native-css
// path again — a genuine circular resolution ("Cannot convert undefined or null to
// object" in copyComponentProperties). Text/View etc. apparently don't hit this
// (RNGH's jestSetup above happens to warm Text first); nothing warmed Image before,
// since no earlier suite rendered a real RN `Image`. Mocked at the exact resolved
// subpath rather than chasing the underlying resolution order further — a plain
// passthrough component, since no screen test asserts on an Image's actual pixels,
// only that the screen renders at all.
jest.mock("react-native-css/components/Image", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  const StubImage = React.forwardRef(
    (props: Record<string, unknown>, ref: unknown) =>
      React.createElement("Image", { ...props, ref }),
  );
  StubImage.displayName = "Image";
  return { __esModule: true, Image: StubImage, default: StubImage };
});

// M34: the same class of crash as Image above, hit by components/trips/photo-viewer-modal.tsx
// (the fullscreen photo viewer), but through a different path — react-native-css's own
// `index.cts` doesn't wrap Modal at all (`get Modal() { return require("react-native").Modal }`,
// a bare passthrough), so this is RN's own lazy `Modal` getter reaching
// `@react-native/jest-preset`'s Modal automock, whose `mockComponent('react-native/Libraries/Modal/Modal', ...)`
// internally does a `jest.requireActual` that recurses into the same react-native-css
// resolution tangle. Stubbed at that exact underlying module id, bypassing the preset's
// own (here, broken) automock rather than chasing the resolution further — same
// justification as Image: no screen test asserts on Modal's native presentation, only
// that its children render (or don't) when `visible` is set.
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const StubModal = ({
    visible,
    children,
  }: {
    visible?: boolean;
    children?: unknown;
  }) => (visible === false ? null : children);
  StubModal.displayName = "Modal";
  return { __esModule: true, default: StubModal };
});

// lib/db/database.ts builds a real SQLiteAdapter at module load, which needs
// react-native-nitro-modules and throws outright under jest. Suites that want
// a real local DB build their own LokiJS one and pass it in explicitly (every
// lib/db/__tests__ file does), so nothing legitimately needs the production
// instance — but any module importing it transitively used to take a whole
// screen suite down with it. That became routine once M9c WP7's cache-age
// lookup (lib/db/cache-freshness.ts) reached the read screens: eight screen
// suites failed at import, none of them for a reason about the screen.
// Stubbed once here rather than re-mocked in every suite that happens to pull
// a db module into its graph.
jest.mock("./lib/db/database", () => ({ database: {} }));
