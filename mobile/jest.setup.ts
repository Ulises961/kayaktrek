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
