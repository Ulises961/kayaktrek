import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { getTripCore, getSession } = vi.hoisted(() => ({
  getTripCore: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock("@/lib/trips/core", () => ({ getTripCore }))
vi.mock("@/lib/auth/session", () => ({ getSession }))
vi.mock("@/components/common/set-breadcrumbs", () => ({ SetBreadcrumbs: () => null }))
vi.mock("@/components/trips/trip-identity-header", () => ({
  TripIdentityHeader: () => <div data-testid="identity-header" />,
}))
vi.mock("@/components/trips/trip-detail-nav", () => ({
  TripDetailNav: ({ liveHref }: { liveHref?: string }) => (
    <div data-testid="nav" data-live-href={liveHref ?? ""} />
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
