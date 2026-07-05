import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import React from "react"
import type { RouteData, RouteDaySegment } from "@/lib/itinerary/public-routes"

const { fitBounds, latLngBounds } = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  latLngBounds: vi.fn((positions: [number, number][]) => ({ __mockBounds: positions })),
}))

vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("leaflet", () => ({ default: { latLngBounds } }))

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  useMap: vi.fn(() => ({ fitBounds })),
}))

const { RouteDayLayers } = vi.hoisted(() => ({ RouteDayLayers: vi.fn(() => null) }))
vi.mock("@/components/map/route-day-layers", () => ({ RouteDayLayers }))

import PublicMap from "../public-map"

function daySegment(overrides: Partial<RouteDaySegment> = {}): RouteDaySegment {
  return {
    dayNumber: 1,
    date: "2026-07-01",
    color: "#2272b6",
    distanceNm: 1.2,
    points: [
      { lat: 41.9, lon: 12.4, type: "position", name: null, images: [], pointNumber: 1 },
      { lat: 42.0, lon: 12.5, type: "stop", name: "Cove", images: [], pointNumber: 2 },
    ],
    ...overrides,
  }
}

function route(overrides: Partial<RouteData> = {}): RouteData {
  return {
    id: "route-1",
    name: "Aegean loop",
    positions: [
      [41.9, 12.4],
      [42.0, 12.5],
    ],
    days: [daySegment()],
    totalMiles: 12,
    dayCount: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PublicMap", () => {
  it("renders the day-coloured route layers with the given routes", () => {
    render(<PublicMap routes={[route()]} />)
    expect(RouteDayLayers).toHaveBeenCalledWith(
      expect.objectContaining({ routes: [route()] }),
      undefined,
    )
  })
})

describe("PublicMap fit-to-route", () => {
  it("fits the map to the route's positions on mount", () => {
    render(<PublicMap routes={[route()]} />)
    expect(latLngBounds).toHaveBeenCalledWith([
      [41.9, 12.4],
      [42.0, 12.5],
    ])
    expect(fitBounds).toHaveBeenCalledWith(
      {
        __mockBounds: [
          [41.9, 12.4],
          [42.0, 12.5],
        ],
      },
      expect.objectContaining({ maxZoom: expect.any(Number) }),
    )
  })

  it("fits across multiple routes' combined positions", () => {
    const other = route({
      id: "route-2",
      positions: [[10, 20]],
      days: [],
    })
    render(<PublicMap routes={[route(), other]} />)
    expect(latLngBounds).toHaveBeenCalledWith([
      [41.9, 12.4],
      [42.0, 12.5],
      [10, 20],
    ])
  })

  it("does not fit when there are no positions", () => {
    render(<PublicMap routes={[route({ positions: [], days: [] })]} />)
    expect(fitBounds).not.toHaveBeenCalled()
  })
})
