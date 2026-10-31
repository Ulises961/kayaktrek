import { render, waitFor } from "@testing-library/react-native"

import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

import AppLayout from "../app/(app)/_layout"
import { useAuth } from "../lib/auth/auth-context"
import { startSyncTrigger } from "../lib/db/sync-trigger"
import { startTripChanges } from "../lib/live/trip-changes"

jest.mock("../lib/auth/auth-context", () => ({
  useAuth: jest.fn(),
}))

// The offline sweep's mount point moved here from the Trip Detail hub in M9c
// WP7. Mocked rather than exercised: the trigger's own behaviour (foreground,
// reconnect, no overlap) has its own suite, and the real module reaches
// NetInfo and the database.
jest.mock("../lib/db/sync-trigger", () => ({
  startSyncTrigger: jest.fn(),
}))

// AppLayout's own job is the auth-gate branching, not the drawer navigator it hands
// off to once authenticated — that's expo-router's own machinery (rubric rule 7,
// the M9-mobile-test-quality plan: don't test the framework). Redirect/Slot are
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

// The global stub in jest.setup.ts is inert; this suite needs to observe the call.
jest.mock("../lib/live/trip-changes", () => ({
  startTripChanges: jest.fn(),
}))

const mockUseAuth = useAuth as jest.Mock
const mockStartSyncTrigger = startSyncTrigger as jest.Mock
const mockStartTripChanges = startTripChanges as jest.Mock

describe("AppLayout", () => {
  beforeEach(() => {
    mockStartTripChanges.mockReset()
    mockStartTripChanges.mockReturnValue(jest.fn())
    mockUseAuth.mockReset()
    mockStartSyncTrigger.mockReset()
    mockStartSyncTrigger.mockReturnValue(jest.fn())
  })

  it("shows a loading indicator while auth status is unresolved", async () => {
    mockUseAuth.mockReturnValue({ status: "loading" })

    const { getByTestId, queryByText } = await render(<AppLayout />, { wrapper: WithCachedSurfaces })

    expect(getByTestId("app-layout-loading")).toBeTruthy()
    expect(queryByText("redirect:/login")).toBeNull()
    expect(queryByText("drawer-content")).toBeNull()
  })

  it("redirects to /login when unauthenticated", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" })

    const { getByText, queryByText } = await render(<AppLayout />, { wrapper: WithCachedSurfaces })

    expect(getByText("redirect:/login")).toBeTruthy()
    expect(queryByText("drawer-content")).toBeNull()
  })

  it("hands off to the drawer navigator when authenticated", async () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" })

    const { getByText, queryByText } = await render(<AppLayout />, { wrapper: WithCachedSurfaces })

    expect(getByText("drawer-content")).toBeTruthy()
    expect(queryByText(/^redirect:/)).toBeNull()
  })

  // M9c WP7: this is the one mount point every authenticated route passes
  // through, which is what makes the sweep's scope independent of navigation.
  it("starts the offline sweep once authenticated", async () => {
    mockUseAuth.mockReturnValue({ status: "authenticated" })

    await render(<AppLayout />, { wrapper: WithCachedSurfaces })

    expect(mockStartSyncTrigger).toHaveBeenCalled()
  })

  it("does not sweep before there is a session to sync with", async () => {
    mockUseAuth.mockReturnValue({ status: "loading" })

    await render(<AppLayout />, { wrapper: WithCachedSurfaces })

    // Every sync call needs a token; sweeping here would just burn a pass on 401s.
    expect(mockStartSyncTrigger).not.toHaveBeenCalled()
  })

  it("does not sweep when unauthenticated", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" })

    await render(<AppLayout />, { wrapper: WithCachedSurfaces })

    expect(mockStartSyncTrigger).not.toHaveBeenCalled()
  })

  it("holds the trip-change stream's lifecycle only while authenticated", async () => {
    mockUseAuth.mockReturnValue({ status: "unauthenticated" })
    await render(<AppLayout />, { wrapper: WithCachedSurfaces })
    expect(mockStartTripChanges).not.toHaveBeenCalled()

    mockUseAuth.mockReturnValue({ status: "authenticated" })
    await render(<AppLayout />, { wrapper: WithCachedSurfaces })
    expect(mockStartTripChanges).toHaveBeenCalledTimes(1)
  })

  it("stops the trip-change stream's listeners on unmount", async () => {
    const stop = jest.fn()
    mockStartTripChanges.mockReturnValue(stop)
    mockUseAuth.mockReturnValue({ status: "authenticated" })

    const { unmount } = await render(<AppLayout />, { wrapper: WithCachedSurfaces })
    unmount()

    await waitFor(() => expect(stop).toHaveBeenCalled())
  })

  it("stops the sweep's listeners on unmount", async () => {
    const stop = jest.fn()
    mockStartSyncTrigger.mockReturnValue(stop)
    mockUseAuth.mockReturnValue({ status: "authenticated" })

    const { unmount } = await render(<AppLayout />, { wrapper: WithCachedSurfaces })
    unmount()

    await waitFor(() => expect(stop).toHaveBeenCalled())
  })
})
