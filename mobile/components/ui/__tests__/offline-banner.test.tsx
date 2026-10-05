import { act, fireEvent, render, waitFor } from "@testing-library/react-native"
import NetInfo from "@react-native-community/netinfo"

import { CachedSurfacesProvider } from "../../../lib/network/cached-surfaces"
import { registerPushRetry, setPushStatus } from "../../../lib/network/push-status"
import { OfflineBanner } from "../offline-banner"

jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(),
  refresh: jest.fn(),
}))

const mockedAddEventListener = NetInfo.addEventListener as jest.Mock
const mockedRefresh = NetInfo.refresh as jest.Mock

function connectivityHandler(): (state: { isConnected: boolean | null }) => void {
  return mockedAddEventListener.mock.calls[0][0] as (state: { isConnected: boolean | null }) => void
}

beforeEach(() => {
  jest.clearAllMocks()
  mockedAddEventListener.mockReturnValue(jest.fn())
  mockedRefresh.mockResolvedValue({ isConnected: false })
  // The push status is module-level, like the pipeline it reports on: reset it so
  // one test's failed push is not the next test's starting banner.
  setPushStatus({ state: "idle", retryAt: null })
  registerPushRetry(async () => "sent")
})

describe("OfflineBanner", () => {
  it("renders nothing while online", async () => {
    const { queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    expect(queryByText(/no internet connection/i)).toBeNull()
  })

  it("shows the full banner once the device goes offline", async () => {
    const { getByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    const handler = connectivityHandler()

    handler({ isConnected: false })

    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
  })

  it("dismissing collapses the banner to an icon pill, not to nothing", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())

    await fireEvent.press(getByLabelText("Dismiss"))

    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())
    expect(getByLabelText(/no internet connection.*tap to expand/i)).toBeTruthy()
  })

  it("tapping the collapsed pill re-expands the full banner", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
    await fireEvent.press(getByLabelText("Dismiss"))
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())

    await fireEvent.press(getByLabelText(/no internet connection.*tap to expand/i))

    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
  })

  it("clears entirely once connectivity returns, even if it had been dismissed", async () => {
    const { getByText, getByLabelText, queryByText, queryByLabelText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
    await fireEvent.press(getByLabelText("Dismiss"))
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())

    handler({ isConnected: true })

    await waitFor(() => expect(queryByLabelText(/no internet connection.*tap to expand/i)).toBeNull())
    expect(queryByText(/no internet connection/i)).toBeNull()
  })

  it("shows the full banner again (not still collapsed) on the next disconnect", async () => {
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
    await fireEvent.press(getByLabelText("Dismiss"))
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())
    handler({ isConnected: true })
    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())

    handler({ isConnected: false })

    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())
  })

  // A manual escape hatch for when the OS is slow to fire its own change
  // event (captive portals, flaky wifi that never fully drops).
  it("forces a connectivity recheck via NetInfo.refresh()", async () => {
    const { getByText, getByLabelText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())

    await fireEvent.press(getByLabelText("Retry sync"))

    expect(mockedRefresh).toHaveBeenCalled()
  })

  // The button used to recheck the network and nothing else: with the OS already
  // calling the device connected, pressing it did nothing visible while changes
  // sat unsent on the phone.
  it("also tries to send the changes still on the phone", async () => {
    const retry = jest.fn(async () => "sent" as const)
    registerPushRetry(retry)
    const { getByText, getByLabelText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    connectivityHandler()({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())

    await fireEvent.press(getByLabelText("Retry sync"))

    await waitFor(() => expect(retry).toHaveBeenCalledTimes(1))
  })

  it("raises the banner when a push failed even though the device thinks it is online", async () => {
    const { getByText, queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    expect(queryByText(/changes not sent yet/i)).toBeNull()

    await act(async () => setPushStatus({ state: "failed", retryAt: Date.now() + 5000 }))

    expect(getByText(/changes not sent yet/i)).toBeTruthy()
    expect(queryByText(/some information may be out of date/i)).toBeNull()
  })

  // One line is all the banner needs to say, retry state included; the
  // reassurance is for whoever asks.
  it("says on the one line that it is retrying, and keeps the reassurance behind Read more", async () => {
    const { getByText, queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })

    await act(async () => setPushStatus({ state: "failed", retryAt: Date.now() + 5000 }))

    expect(getByText(/changes not sent yet\. retrying/i)).toBeTruthy()
    expect(queryByText(/saved on this phone/i)).toBeNull()

    await fireEvent.press(getByText("Read more"))

    expect(getByText(/saved on this phone/i)).toBeTruthy()
  })

  it("says to tap to retry on that line once the automatic retries have run out", async () => {
    const { getByText, queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })

    await act(async () => setPushStatus({ state: "failed", retryAt: null }))

    expect(getByText(/changes not sent yet\. tap to retry/i)).toBeTruthy()
    expect(queryByText(/retrying/i)).toBeNull()
  })

  it("keeps saying so when a manual retry fails too, instead of going quiet", async () => {
    registerPushRetry(async () => {
      setPushStatus({ state: "failed", retryAt: Date.now() + 5000 })
      return "failed"
    })
    const { getByText, getByLabelText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    await act(async () => setPushStatus({ state: "failed", retryAt: null }))
    expect(getByText(/tap to retry/i)).toBeTruthy()

    await fireEvent.press(getByLabelText("Retry sync"))

    await waitFor(() => expect(getByText(/changes not sent yet\. retrying/i)).toBeTruthy())
  })

  it("clears once the push goes through", async () => {
    const { queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    await act(async () => setPushStatus({ state: "failed", retryAt: null }))
    expect(queryByText(/changes not sent yet/i)).toBeTruthy()

    await act(async () => setPushStatus({ state: "idle", retryAt: null }))

    await waitFor(() => expect(queryByText(/changes not sent yet/i)).toBeNull())
  })

  it("leaves the device-offline headline alone and still files the push details under Read more", async () => {
    const { getByText, queryByText } = await render(<OfflineBanner />, { wrapper: CachedSurfacesProvider })
    connectivityHandler()({ isConnected: false })
    await act(async () => setPushStatus({ state: "failed", retryAt: null }))

    expect(getByText(/no internet connection/i)).toBeTruthy()
    expect(queryByText(/changes not sent yet/i)).toBeNull()

    await fireEvent.press(getByText("Read more"))

    expect(getByText(/saved on this phone/i)).toBeTruthy()
  })

  it("clears once a forced recheck reports the device back online", async () => {
    mockedRefresh.mockResolvedValue({ isConnected: true })
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />, {
      wrapper: CachedSurfacesProvider,
    })
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())

    await fireEvent.press(getByLabelText("Retry sync"))
    // recheckConnectivity() only forces NetInfo to re-evaluate — the banner
    // still updates through the same addEventListener callback it always
    // does, which NetInfo.refresh() is documented to invoke.
    connectivityHandler()({ isConnected: true })

    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())
  })
})
