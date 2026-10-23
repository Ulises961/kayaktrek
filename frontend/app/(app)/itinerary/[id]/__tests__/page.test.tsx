import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { apiGet, getSession, listSatelliteFeeds } = vi.hoisted(() => ({
  apiGet: vi.fn(),
  getSession: vi.fn(),
  listSatelliteFeeds: vi.fn(),
}))
vi.mock("@/lib/api/client", () => ({
  apiGet,
  rethrowIfRedirect: vi.fn(),
  rethrowUnlessClientError: vi.fn(),
}))
vi.mock("@/lib/auth/session", () => ({ getSession }))
vi.mock("@/lib/user/me", () => ({ getMe: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/satellite-feeds/actions", () => ({ listSatelliteFeeds }))
vi.mock("@/components/trips/trip-changes-listener", () => ({ TripChangesListener: () => null }))
vi.mock("@/components/map/map-builder", () => ({
  MapBuilder: ({
    showNavigate,
    inReachIsSource,
  }: {
    showNavigate?: boolean
    inReachIsSource?: boolean
  }) => (
    <div
      data-testid="map-builder"
      data-show-navigate={String(showNavigate)}
      data-in-reach-is-source={String(inReachIsSource)}
    />
  ),
}))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

import ItineraryBuilderPage from "../page"
import { SATELLITE_PROVIDER } from "@/lib/dtos/satellite-feed"
import { TRIP_STATE } from "@/lib/dtos/trip"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000002"
const USER_ID = "01952f1a-0000-7000-8000-000000000003"

const ITINERARY = { id: ITINERARY_ID, isPublic: false, totalMiles: 0, tripId: TRIP_ID, days: [] }

function trip(member: Record<string, unknown> = {}, state: string = TRIP_STATE.HAPPENING) {
  return {
    id: TRIP_ID,
    destination: "Cinque Terre",
    state,
    travellers: [
      {
        id: "01952f1a-0000-7000-8000-000000000010",
        role: "crew",
        user: { id: USER_ID, mail: "ada@example.com", username: "ada", name: "Ada" },
        ...member,
      },
    ],
  }
}

function feed(overrides: Record<string, unknown> = {}) {
  return {
    id: "01952f1a-0000-7000-8000-000000000030",
    provider: SATELLITE_PROVIDER.INREACH_MAPSHARE,
    feedUrl: "https://share.garmin.com/ada",
    hasPassword: false,
    needsReauth: false,
    ...overrides,
  }
}

async function renderPage(tripRaw: unknown, userId: string = USER_ID) {
  apiGet.mockImplementation(async (path: string) =>
    path.startsWith("/api/itinerary/") ? ITINERARY : tripRaw,
  )
  getSession.mockResolvedValue({ userId })
  render(await ItineraryBuilderPage({ params: Promise.resolve({ id: ITINERARY_ID }) }))
  return screen.getByTestId("map-builder")
}

describe("ItineraryBuilderPage, inReach as the position source (M29)", () => {
  afterEach(() => vi.clearAllMocks())

  it("tells the map inReach is the source: switch on, aboard, a feed being polled", async () => {
    listSatelliteFeeds.mockResolvedValue([feed()])

    const map = await renderPage(trip({ sharesSatellitePosition: true }))

    expect(map).toHaveAttribute("data-show-navigate", "true")
    expect(map).toHaveAttribute("data-in-reach-is-source", "true")
  })

  it("does not look the feed up when the switch is off", async () => {
    listSatelliteFeeds.mockResolvedValue([feed()])

    const map = await renderPage(trip({ sharesSatellitePosition: false }))

    expect(map).toHaveAttribute("data-in-reach-is-source", "false")
    expect(listSatelliteFeeds).not.toHaveBeenCalled()
  })

  it("falls back to the phone when the switch is on but the only feed needs its password", async () => {
    listSatelliteFeeds.mockResolvedValue([feed({ needsReauth: true })])

    const map = await renderPage(trip({ sharesSatellitePosition: true }))

    expect(map).toHaveAttribute("data-in-reach-is-source", "false")
  })

  it("falls back to the phone when the switch is on but no feed is registered", async () => {
    listSatelliteFeeds.mockResolvedValue([])

    const map = await renderPage(trip({ sharesSatellitePosition: true }))

    expect(map).toHaveAttribute("data-in-reach-is-source", "false")
  })

  it("does not look the feed up where Navigate is not offered", async () => {
    listSatelliteFeeds.mockResolvedValue([feed()])

    const building = await renderPage(trip({ sharesSatellitePosition: true }, TRIP_STATE.BUILDING))
    expect(building).toHaveAttribute("data-show-navigate", "false")
    expect(building).toHaveAttribute("data-in-reach-is-source", "false")
    expect(listSatelliteFeeds).not.toHaveBeenCalled()
  })

  it("does not look the feed up for someone who is not a member", async () => {
    listSatelliteFeeds.mockResolvedValue([feed()])

    const map = await renderPage(trip({ sharesSatellitePosition: true }), "someone-else")

    expect(map).toHaveAttribute("data-in-reach-is-source", "false")
    expect(listSatelliteFeeds).not.toHaveBeenCalled()
  })
})
