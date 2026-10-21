import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { getTripCore, getSession, listSatelliteFeeds } = vi.hoisted(() => ({
  getTripCore: vi.fn(),
  getSession: vi.fn(),
  listSatelliteFeeds: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/trips/core", () => ({ getTripCore }))
vi.mock("@/lib/auth/session", () => ({ getSession }))
vi.mock("@/lib/satellite-feeds/actions", () => ({ listSatelliteFeeds }))
vi.mock("@/components/common/set-breadcrumbs", () => ({ SetBreadcrumbs: () => null }))
vi.mock("@/components/trips/trip-identity-header", () => ({
  TripIdentityHeader: ({ hasSatelliteFeed }: { hasSatelliteFeed: boolean }) => (
    <div data-testid="identity-header" data-has-satellite-feed={String(hasSatelliteFeed)} />
  ),
}))
vi.mock("@/components/trips/trip-detail-nav", () => ({
  TripDetailNav: ({ liveHref }: { liveHref?: string }) => (
    <div data-testid="nav" data-live-href={liveHref ?? ""} />
  ),
}))
vi.mock("@/components/trips/trip-changes-listener", () => ({
  TripChangesListener: ({ tripId, initialRev }: { tripId: string; initialRev?: number | null }) => (
    <div data-testid="changes-listener" data-trip-id={tripId} data-initial-rev={initialRev ?? ""} />
  ),
}))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

import TripDetailLayout from "../layout"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000002"
const USER_ID = "01952f1a-0000-7000-8000-000000000003"

function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: TRIP_ID,
    destination: "Cinque Terre",
    state: "happening",
    itinerary: { id: ITINERARY_ID },
    travellers: [{ role: "leader", user: { id: USER_ID } }],
    ...overrides,
  }
}

describe("TripDetailLayout", () => {
  afterEach(() => vi.clearAllMocks())

  it("404s when the trip does not exist", async () => {
    getTripCore.mockResolvedValue(null)
    getSession.mockResolvedValue(null)

    await expect(
      TripDetailLayout({ children: null, params: Promise.resolve({ id: TRIP_ID }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
  })
})

describe("TripDetailLayout — live sync (M36)", () => {
  afterEach(() => vi.clearAllMocks())

  it("listens for other people's changes to the trip, for a member", async () => {
    getTripCore.mockResolvedValue(trip({ state: "building" }))
    getSession.mockResolvedValue({ userId: USER_ID })

    render(await TripDetailLayout({ children: null, params: Promise.resolve({ id: TRIP_ID }) }))

    expect(screen.getByTestId("changes-listener")).toHaveAttribute("data-trip-id", TRIP_ID)
  })

  it("starts the listener from the revision the trip was read at", async () => {
    getTripCore.mockResolvedValue(trip({ state: "building", changeRev: 41 }))
    getSession.mockResolvedValue({ userId: USER_ID })

    render(await TripDetailLayout({ children: null, params: Promise.resolve({ id: TRIP_ID }) }))

    expect(screen.getByTestId("changes-listener")).toHaveAttribute("data-initial-rev", "41")
  })

  it("starts the listener without a revision when the trip came back without one", async () => {
    getTripCore.mockResolvedValue(trip({ state: "building", changeRev: null }))
    getSession.mockResolvedValue({ userId: USER_ID })

    render(await TripDetailLayout({ children: null, params: Promise.resolve({ id: TRIP_ID }) }))

    expect(screen.getByTestId("changes-listener")).toHaveAttribute("data-initial-rev", "")
  })

  it("does not poll for someone who is not a member", async () => {
    // The poll would refuse them anyway; not starting it spares the sidecar the requests
    // and the page a ticket mint that can only 403.
    getTripCore.mockResolvedValue(trip({ state: "building" }))
    getSession.mockResolvedValue({ userId: "someone-else" })

    render(await TripDetailLayout({ children: null, params: Promise.resolve({ id: TRIP_ID }) }))

    expect(screen.queryByTestId("changes-listener")).toBeNull()
  })
})

describe("TripDetailLayout — inReach switch (M29)", () => {
  afterEach(() => {
    vi.clearAllMocks()
    // Back to "no feed", which is what the other describes in this file run under.
    listSatelliteFeeds.mockResolvedValue([])
  })

  const FEED = { id: "01952f1a-0000-7000-8000-000000000004" }

  async function renderLayout() {
    render(await TripDetailLayout({ children: null, params: Promise.resolve({ id: TRIP_ID }) }))
    return screen.getByTestId("identity-header")
  }

  it("tells the header a feed is registered, for a member of a trip that offers the switch", async () => {
    getTripCore.mockResolvedValue(trip({ state: "building" }))
    getSession.mockResolvedValue({ userId: USER_ID })
    listSatelliteFeeds.mockResolvedValue([FEED])

    expect(await renderLayout()).toHaveAttribute("data-has-satellite-feed", "true")
  })

  it("tells the header there is no feed when the member has none registered", async () => {
    getTripCore.mockResolvedValue(trip())
    getSession.mockResolvedValue({ userId: USER_ID })
    listSatelliteFeeds.mockResolvedValue([])

    expect(await renderLayout()).toHaveAttribute("data-has-satellite-feed", "false")
    expect(listSatelliteFeeds).toHaveBeenCalledTimes(1)
  })

  it("does not look the feed up where the switch is not offered", async () => {
    // The layout wraps every tab, so each lookup is paid on every trip page load.
    getTripCore.mockResolvedValue(trip({ state: "past" }))
    getSession.mockResolvedValue({ userId: USER_ID })
    listSatelliteFeeds.mockResolvedValue([FEED])

    expect(await renderLayout()).toHaveAttribute("data-has-satellite-feed", "false")
    expect(listSatelliteFeeds).not.toHaveBeenCalled()
  })

  it("does not look the feed up for someone who is not a member", async () => {
    getTripCore.mockResolvedValue(trip())
    getSession.mockResolvedValue({ userId: "someone-else" })
    listSatelliteFeeds.mockResolvedValue([FEED])

    expect(await renderLayout()).toHaveAttribute("data-has-satellite-feed", "false")
    expect(listSatelliteFeeds).not.toHaveBeenCalled()
  })

  it("does not look the feed up for a member who has left", async () => {
    getTripCore.mockResolvedValue(
      trip({
        travellers: [{ role: "crew", leftAt: "2026-10-02T09:30:00", user: { id: USER_ID } }],
      }),
    )
    getSession.mockResolvedValue({ userId: USER_ID })
    listSatelliteFeeds.mockResolvedValue([FEED])

    expect(await renderLayout()).toHaveAttribute("data-has-satellite-feed", "false")
    expect(listSatelliteFeeds).not.toHaveBeenCalled()
  })
})

describe("TripDetailLayout — liveHref", () => {
  afterEach(() => vi.clearAllMocks())

  it("sets liveHref for a member of a happening trip", async () => {
    getTripCore.mockResolvedValue(trip())
    getSession.mockResolvedValue({ userId: USER_ID })

    const jsx = await TripDetailLayout({
      children: null,
      params: Promise.resolve({ id: TRIP_ID }),
    })
    render(jsx)

    expect(screen.getByTestId("nav")).toHaveAttribute(
      "data-live-href",
      `/itinerary/${ITINERARY_ID}?navigate=1`,
    )
  })

  it("omits liveHref when the trip is not happening", async () => {
    getTripCore.mockResolvedValue(trip({ state: "building" }))
    getSession.mockResolvedValue({ userId: USER_ID })

    const jsx = await TripDetailLayout({
      children: null,
      params: Promise.resolve({ id: TRIP_ID }),
    })
    render(jsx)

    expect(screen.getByTestId("nav")).toHaveAttribute("data-live-href", "")
  })

  it("omits liveHref for a non-member even on a happening trip", async () => {
    getTripCore.mockResolvedValue(trip())
    getSession.mockResolvedValue({ userId: "someone-else" })

    const jsx = await TripDetailLayout({
      children: null,
      params: Promise.resolve({ id: TRIP_ID }),
    })
    render(jsx)

    expect(screen.getByTestId("nav")).toHaveAttribute("data-live-href", "")
  })

  it("omits liveHref when there is no session", async () => {
    getTripCore.mockResolvedValue(trip())
    getSession.mockResolvedValue(null)

    const jsx = await TripDetailLayout({
      children: null,
      params: Promise.resolve({ id: TRIP_ID }),
    })
    render(jsx)

    expect(screen.getByTestId("nav")).toHaveAttribute("data-live-href", "")
  })
})
