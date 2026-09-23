import { act, fireEvent, render } from "@testing-library/react-native"
import NetInfo from "@react-native-community/netinfo"

import { WithOfflineBanner } from "../../../test-utils/with-offline-banner"
import { NeedsConnectionNotice, OfflineNotice } from "../offline-notice"

jest.mock("@react-native-community/netinfo", () => ({ addEventListener: jest.fn() }))

const mockedAddEventListener = NetInfo.addEventListener as jest.Mock

async function goOffline() {
  const handler = mockedAddEventListener.mock.calls[0][0] as (state: {
    isConnected: boolean | null
  }) => void
  await act(async () => handler({ isConnected: false }))
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

const DETAIL = "Adding, covering, and removing need a connection."

beforeEach(() => {
  jest.clearAllMocks()
  mockedAddEventListener.mockReturnValue(jest.fn())
})

// The notice renders nothing itself — it tells the app-root banner what the
// screen is showing from the cache, so these assert what the banner says.
describe("OfflineNotice", () => {
  // Three tiers: what happened, how old the data is, and — on request — what
  // cannot be done with it. The age is what a paddler checks every time, so it
  // is never behind the toggle.
  it("shows the headline and the age, with the detail folded away", async () => {
    const { findByText, getByText, queryByText } = await render(
      <OfflineNotice cachedAt={hoursAgo(48)}>{DETAIL}</OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText("No internet connection.")).toBeTruthy()
    expect(getByText("Last synced 2 days ago.")).toBeTruthy()
    expect(getByText("Read more")).toBeTruthy()
    expect(queryByText(DETAIL)).toBeNull()
  })

  it("unfolds the detail on Read more, and folds it again", async () => {
    const { findByText, getByText, queryByText } = await render(
      <OfflineNotice cachedAt={hoursAgo(1)}>{DETAIL}</OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    await fireEvent.press(await findByText("Read more"))
    expect(getByText(DETAIL)).toBeTruthy()

    await fireEvent.press(getByText("Show less"))
    expect(queryByText(DETAIL)).toBeNull()
  })

  // Replaces, rather than sits beside, the banner's generic line: two messages
  // about one fact was what this moved into the banner to fix.
  it("replaces the banner's generic out-of-date line", async () => {
    const { findByText, queryByText } = await render(
      <OfflineNotice cachedAt={hoursAgo(1)}>{DETAIL}</OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText(/Last synced/)).toBeTruthy()
    expect(queryByText(/may be out of date/)).toBeNull()
  })

  // docs/adr/mobile-offline.md: staleness must be expressed. Saying nothing
  // about the age reads as "fresh", which is exactly the wrong default.
  it("says the sync time is unknown rather than omitting it", async () => {
    const { findByText } = await render(
      <OfflineNotice cachedAt={null}>{DETAIL}</OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText("Last sync time unknown.")).toBeTruthy()
  })

  // Cached data with signal means the server was unreachable. The paddler is on
  // the same stale data, so the banner rises anyway, headed honestly.
  it("raises the banner with signal when the screen is on cached data", async () => {
    const { findByText, queryByText } = await render(
      <OfflineNotice cachedAt={hoursAgo(1)}>{DETAIL}</OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )

    expect(await findByText("Can't reach the server.")).toBeTruthy()
    expect(queryByText("No internet connection.")).toBeNull()
    expect(await findByText(/Last synced/)).toBeTruthy()
  })

  it("reports nothing while the screen is on live data", async () => {
    const { queryByText } = await render(
      <OfflineNotice cachedAt={hoursAgo(1)} visible={false}>
        {DETAIL}
      </OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )

    expect(queryByText(/Last synced/)).toBeNull()
    expect(queryByText("Can't reach the server.")).toBeNull()
  })

  // Collapsed, one age: the oldest, since a screen is only as fresh as its
  // stalest surface. Unfolded, each surface says its own.
  it("shows the oldest age collapsed, and each surface's own when unfolded", async () => {
    const { findByText, getByText } = await render(
      <>
        <OfflineNotice cachedAt={hoursAgo(1)}>Buddies: accepting needs a connection.</OfflineNotice>
        <OfflineNotice cachedAt={hoursAgo(48)}>Blocklist: unblocking needs a connection.</OfflineNotice>
      </>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText("Last synced 2 days ago.")).toBeTruthy()

    await fireEvent.press(getByText("Read more"))
    expect(getByText(/Buddies: accepting needs a connection\. Last synced 1 hours? ago/)).toBeTruthy()
    expect(getByText(/Blocklist: unblocking needs a connection\. Last synced 2 days ago/)).toBeTruthy()
  })

  it("lets an unknown age win over a known one", async () => {
    const { findByText } = await render(
      <>
        <OfflineNotice cachedAt={hoursAgo(1)}>Buddies.</OfflineNotice>
        <OfflineNotice cachedAt={null}>Blocklist.</OfflineNotice>
      </>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText("Last sync time unknown.")).toBeTruthy()
  })

  // Stack and drawer screens stay mounted behind the one in front; the banner
  // must describe the screen the paddler is actually looking at.
  it("stays silent while its screen is not the focused one", async () => {
    // The module object jest hands out, not an `import * as` namespace — babel's
    // interop copies the mock's properties, so a spy on that copy never fires.
    const router = jest.requireMock<typeof import("expo-router")>("expo-router")
    const focus = jest.spyOn(router, "useIsFocused").mockReturnValue(false)

    const { findByText, queryByText } = await render(
      <OfflineNotice cachedAt={hoursAgo(1)}>{DETAIL}</OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText(/may be out of date/)).toBeTruthy()
    expect(queryByText(/Last synced/)).toBeNull()
    focus.mockRestore()
  })

  // The route, the trip hub: the age is the whole message, so there is nothing
  // to fold away and no toggle to offer.
  it("offers no Read more when the screen has nothing to add to the age", async () => {
    const { findByText, queryByText } = await render(<OfflineNotice cachedAt={hoursAgo(1)} />, {
      wrapper: WithOfflineBanner,
    })
    await goOffline()

    expect(await findByText(/Last synced/)).toBeTruthy()
    expect(queryByText("Read more")).toBeNull()
  })

  it("withdraws its report when the screen goes away", async () => {
    const { findByText, queryByText, rerender } = await render(
      <OfflineNotice cachedAt={hoursAgo(1)}>{DETAIL}</OfflineNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()
    await findByText(/Last synced/)

    await rerender(<></>)

    expect(queryByText(/Last synced/)).toBeNull()
    expect(await findByText(/may be out of date/)).toBeTruthy()
  })
})

// Explore (by choice) and Settings (until tier 4) have no cached copy at all.
// Offline is still the expected state there, so the banner says what needs a
// connection in place of the raw network error the screen used to print in red.
describe("NeedsConnectionNotice", () => {
  it("says what needs a connection, directly and with no age", async () => {
    const { findByText, queryByText } = await render(
      <NeedsConnectionNotice>Explore needs a connection.</NeedsConnectionNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText("No internet connection.")).toBeTruthy()
    expect(await findByText("Explore needs a connection.")).toBeTruthy()
    expect(queryByText(/Last sync/)).toBeNull()
    expect(queryByText("Read more")).toBeNull()
    expect(queryByText(/may be out of date/)).toBeNull()
  })

  it("reports nothing until the screen actually needs it", async () => {
    const { findByText, queryByText } = await render(
      <NeedsConnectionNotice visible={false}>Explore needs a connection.</NeedsConnectionNotice>,
      { wrapper: WithOfflineBanner },
    )
    await goOffline()

    expect(await findByText(/may be out of date/)).toBeTruthy()
    expect(queryByText("Explore needs a connection.")).toBeNull()
  })
})
