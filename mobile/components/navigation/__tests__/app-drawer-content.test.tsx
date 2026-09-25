import { fireEvent, render } from "@testing-library/react-native"
import type { DrawerContentComponentProps } from "expo-router/drawer"
import { Alert } from "react-native"

import { QueuedChangesContext } from "../../../lib/network/queued-changes"

import { AppDrawerContent } from "../app-drawer-content"
import { useAuth } from "../../../lib/auth/auth-context"
import { getMe } from "../../../lib/profile/actions"
import { loadMeCache } from "../../../lib/db/profile-cache"

jest.mock("../../../lib/auth/auth-context", () => ({
  useAuth: jest.fn(),
}))
jest.mock("../../../lib/profile/actions", () => ({
  getMe: jest.fn(),
}))
jest.mock("../../../lib/db/profile-cache", () => ({
  loadMeCache: jest.fn(),
}))
// The real DrawerContentScrollView/DrawerItemList need a live navigation tree this unit
// test has no reason to stand up — this component's own job is the header/footer around
// them, so a passthrough stub is enough to prove they're rendered in place.
jest.mock("expo-router/drawer", () => ({
  DrawerContentScrollView: ({ children }: { children: React.ReactNode }) => children,
  DrawerItemList: () => null,
}))

const mockUseAuth = useAuth as jest.Mock
const mockGetMe = getMe as jest.Mock
const mockLoadMeCache = loadMeCache as jest.Mock

const mockNavigate = jest.fn()
const mockCloseDrawer = jest.fn()
const fakeProps = {
  navigation: { navigate: mockNavigate, closeDrawer: mockCloseDrawer },
} as unknown as DrawerContentComponentProps

describe("AppDrawerContent", () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
    mockUseAuth.mockReturnValue({ status: "authenticated", signOut: jest.fn() })
    mockGetMe.mockReset()
    mockGetMe.mockResolvedValue({ name: "Tester One", username: "tester" })
    mockLoadMeCache.mockReset()
    mockLoadMeCache.mockResolvedValue(null)
    mockNavigate.mockReset()
    mockCloseDrawer.mockReset()
  })

  it("shows the signed-in user's identity once the profile fetch resolves", async () => {
    const { findByText } = await render(<AppDrawerContent {...fakeProps} />)

    expect(await findByText("Tester One")).toBeTruthy()
    expect(await findByText("@tester")).toBeTruthy()
  })

  it("shows the user's initials as an avatar fallback when there's no avatar image", async () => {
    const { findByText } = await render(<AppDrawerContent {...fakeProps} />)

    expect(await findByText("T")).toBeTruthy()
  })

  it("still renders sign out when the identity fetch fails", async () => {
    mockGetMe.mockRejectedValue(new Error("network error"))

    const { findByTestId } = await render(<AppDrawerContent {...fakeProps} />)

    expect(await findByTestId("sign-out")).toBeTruthy()
  })

  // Tier 4: offline, the header reads the cached record instead of going blank.
  it("falls back to the cached identity when the profile fetch fails", async () => {
    mockGetMe.mockRejectedValue(new Error("network error"))
    mockLoadMeCache.mockResolvedValue({ name: "Cached Paddler", username: "cached" })

    const { findByText } = await render(<AppDrawerContent {...fakeProps} />)

    expect(await findByText("@cached")).toBeTruthy()
  })

  it("calls signOut when the footer button is pressed", async () => {
    const signOut = jest.fn()
    mockUseAuth.mockReturnValue({ status: "authenticated", signOut })

    const { findByTestId } = await render(<AppDrawerContent {...fakeProps} />)

    await fireEvent.press(await findByTestId("sign-out"))

    expect(signOut).toHaveBeenCalledTimes(1)
  })

  // M9d: changes made offline live only on this phone until sent. Signing out
  // throws them away, so it asks first rather than losing someone's day of edits.
  describe("with changes waiting to send", () => {
    const pendingChange = {
      mutationId: "m-1",
      entityType: "log",
      operation: "create",
      entityId: "l-1",
      payload: {},
      deviceTimestamp: "2026-09-25T10:00:00.000Z",
      status: "pending" as const,
      reason: null,
    }

    function renderWithQueue(discardAll: jest.Mock) {
      const queue = { pending: [pendingChange], rejected: [], dismiss: jest.fn(), discardAll }
      return render(
        <QueuedChangesContext.Provider value={queue}>
          <AppDrawerContent {...fakeProps} />
        </QueuedChangesContext.Provider>,
      )
    }

    it("asks before signing out", async () => {
      const signOut = jest.fn()
      mockUseAuth.mockReturnValue({ status: "authenticated", signOut })
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {})

      const { findByTestId } = await renderWithQueue(jest.fn())
      await fireEvent.press(await findByTestId("sign-out"))

      expect(alert).toHaveBeenCalled()
      expect(alert.mock.calls.at(-1)?.[1]).toMatch(/1 change/)
      expect(signOut).not.toHaveBeenCalled()
    })

    it("discards the queue and signs out once confirmed", async () => {
      const signOut = jest.fn()
      const discardAll = jest.fn(async () => undefined)
      mockUseAuth.mockReturnValue({ status: "authenticated", signOut })
      const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {})

      const { findByTestId } = await renderWithQueue(discardAll)
      await fireEvent.press(await findByTestId("sign-out"))
      const buttons = alert.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => Promise<void> }[]
      await buttons.find((button) => button.text === "Sign out")?.onPress?.()

      expect(discardAll).toHaveBeenCalled()
      expect(signOut).toHaveBeenCalledTimes(1)
    })
  })

  it("navigates to Profile and closes the drawer when the identity row is pressed", async () => {
    const { findByTestId } = await render(<AppDrawerContent {...fakeProps} />)

    await fireEvent.press(await findByTestId("drawer-identity"))

    expect(mockNavigate).toHaveBeenCalledWith("(profile)")
    expect(mockCloseDrawer).toHaveBeenCalledTimes(1)
  })

  it("does not render the identity row (or crash) while the profile fetch is pending", async () => {
    mockGetMe.mockReturnValue(new Promise(() => {})) // never resolves

    const { queryByTestId } = await render(<AppDrawerContent {...fakeProps} />)

    expect(queryByTestId("drawer-identity")).toBeNull()
  })
})
