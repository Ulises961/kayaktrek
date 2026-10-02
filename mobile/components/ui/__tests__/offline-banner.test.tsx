import { useEffect } from "react"
import { fireEvent, render, waitFor } from "@testing-library/react-native"
import NetInfo from "@react-native-community/netinfo"

import { CachedSurfacesProvider, useCachedSurfaces } from "../../../lib/network/cached-surfaces"
import { OfflineBanner } from "../offline-banner"

// A reporter with no retry of its own — mirrors a screen that renders
// OfflineNotice without an onRetry, which must not throw when Recheck fires.
function StaleReport() {
  const { report } = useCachedSurfaces()
  useEffect(() => {
    report("stale-report", { message: "Can't load this." })
    return () => report("stale-report", null)
  }, [report])
  return null
}

// A reporter standing in for a screen whose backend request failed for a
// reason that has since gone away (the bug this covers: the backend was
// reachable the whole time, but nothing had re-run the request that
// originally failed, so the banner never got a chance to re-check). Its
// retry simulates the load succeeding this time, by reporting itself clear —
// exactly what a real screen's reload() does on success.
function RetryableReport({ onRetried }: { onRetried: () => void }) {
  const { report, registerRetry } = useCachedSurfaces()
  useEffect(() => {
    report("retryable-report", { message: "Can't load this." })
    registerRetry("retryable-report", () => {
      report("retryable-report", null)
      onRetried()
    })
    return () => {
      report("retryable-report", null)
      registerRetry("retryable-report", null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- registers once; the retry closes over the stable report/onRetried
  }, [])
  return null
}

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

    await fireEvent.press(getByLabelText("Recheck connection"))

    expect(mockedRefresh).toHaveBeenCalled()
  })

  it("clears once a forced recheck reports the device back online", async () => {
    mockedRefresh.mockResolvedValue({ isConnected: true })
    const { getByText, getByLabelText, queryByText } = await render(<OfflineBanner />, {
      wrapper: CachedSurfacesProvider,
    })
    const handler = connectivityHandler()
    handler({ isConnected: false })
    await waitFor(() => expect(getByText(/no internet connection/i)).toBeTruthy())

    await fireEvent.press(getByLabelText("Recheck connection"))
    // recheckConnectivity() only forces NetInfo to re-evaluate — the banner
    // still updates through the same addEventListener callback it always
    // does, which NetInfo.refresh() is documented to invoke.
    connectivityHandler()({ isConnected: true })

    await waitFor(() => expect(queryByText(/no internet connection/i)).toBeNull())
  })

  // The bug found live: the device was online and the backend reachable the
  // whole time, but the banner stayed on "Can't reach the server" because
  // Recheck only re-polled NetInfo, never the failed request itself.
  it("retries a reporter's failed request on Recheck, and clears once it succeeds", async () => {
    mockedRefresh.mockResolvedValue({ isConnected: true })
    const onRetried = jest.fn(() => undefined)
    const { getByText, getByLabelText, queryByText } = await render(
      <CachedSurfacesProvider>
        <OfflineBanner />
        <RetryableReport onRetried={onRetried} />
      </CachedSurfacesProvider>,
    )

    await waitFor(() => expect(getByText(/can't reach the server/i)).toBeTruthy())

    await fireEvent.press(getByLabelText("Recheck connection"))

    expect(onRetried).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(queryByText(/can't reach the server/i)).toBeNull())
  })

  it("does nothing for a reporter with no retry registered", async () => {
    mockedRefresh.mockResolvedValue({ isConnected: true })
    const { getByText, getByLabelText } = await render(
      <CachedSurfacesProvider>
        <OfflineBanner />
        <StaleReport />
      </CachedSurfacesProvider>,
    )
    await waitFor(() => expect(getByText(/can't reach the server/i)).toBeTruthy())

    await expect(fireEvent.press(getByLabelText("Recheck connection"))).resolves.not.toThrow()
  })
})
