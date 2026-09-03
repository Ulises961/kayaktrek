import { render } from "@testing-library/react-native"

import HomeScreen from "../app/(app)/index"
import { AuthProvider } from "../lib/auth/auth-context"

// expo-secure-store has no jest-expo mock — stub it so AuthProvider's mount-time
// getAccessToken() call doesn't hit a native module under test.
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// Carries forward WP5's proof that Metro's watchFolders resolves
// `frontend/lib/{tokens,dtos/point}` and that the mock Point actually parses through the
// real Zod schema (an invalid shape would throw before this render) — now from the real
// authenticated home screen rather than the throwaway App.tsx it replaced.
describe("HomeScreen", () => {
  it("renders the parsed DTO field pulled in from the frontend workspace", async () => {
    const { findByText } = await render(
      <AuthProvider>
        <HomeScreen />
      </AuthProvider>,
    )

    expect(await findByText("Porthmadog slipway")).toBeTruthy()
    expect(
      await findByText("High-water launch only — check the rule of twelfths before setting off."),
    ).toBeTruthy()
  })
})
