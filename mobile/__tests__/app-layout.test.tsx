import { render } from "@testing-library/react-native"

import AppLayout from "../app/(app)/_layout"
import { useAuth } from "../lib/auth/auth-context"

jest.mock("../lib/auth/auth-context", () => ({
  useAuth: jest.fn(),
}))

// AppLayout's own job is the auth-gate branching, not the drawer navigator it hands
// off to once authenticated — that's expo-router's own machinery (rubric rule 7,
// plans/M9-mobile-test-quality.md: don't test the framework). Redirect/Slot are
// stubbed to plain markers so this test asserts AppLayout's branching, not
// expo-router's internals, the same way jest.setup.ts already stubs Stack.Screen.
jest.mock("expo-router", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require("react-native")
  return {
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
    Slot: () => <Text>drawer-content</Text>,
  }
})

const mockUseAuth = useAuth as jest.Mock

describe("AppLayout", () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
  })

  it("shows a loading indicator while auth status is unresolved", async () => {
    mockUseAuth.mockReturnValue({ status: "loading" })

    const { getByTestId, queryByText } = await render(<AppLayout />)

    expect(getByTestId("app-layout-loading")).toBeTruthy()
    expect(queryByText("redirect:/login")).toBeNull()
    expect(queryByText("drawer-content")).toBeNull()
  })

  it("redirects to /login when unauthenticated", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" })

    const { getByText, queryByText } = await render(<AppLayout />)

    expect(getByText("redirect:/login")).toBeTruthy()
    expect(queryByText("drawer-content")).toBeNull()
  })

  it("hands off to the drawer navigator when authenticated", async () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" })

    const { getByText, queryByText } = await render(<AppLayout />)

    expect(getByText("drawer-content")).toBeTruthy()
    expect(queryByText(/^redirect:/)).toBeNull()
  })
})
