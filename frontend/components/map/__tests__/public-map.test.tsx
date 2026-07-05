import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import React from "react"
import type { RouteData, RouteDaySegment } from "@/lib/itinerary/public-routes"

const { ringIcon, fitBounds, latLngBounds } = vi.hoisted(() => ({
  ringIcon: vi.fn(() => ({ __mockIcon: true })),
  fitBounds: vi.fn(),
  latLngBounds: vi.fn((positions: [number, number][]) => ({ __mockBounds: positions })),
}))

vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("@/components/map/ring-icon", () => ({ ringIcon }))
vi.mock("leaflet", () => ({ default: { latLngBounds } }))

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Polyline: vi.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>),
  Marker: vi.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
  useMap: vi.fn(() => ({ fitBounds })),
}))

import { Polyline, Marker } from "react-leaflet"
import PublicMap from "../public-map"

function daySegment(overrides: Partial<RouteDaySegment> = {}): RouteDaySegment {
  return {
    dayNumber: 1,
    date: "2026-07-01",
    color: "#2272b6",
    distanceNm: 1.2,
    points: [
      { lat: 41.9, lon: 12.4, type: "position", name: null, images: [] },
      { lat: 42.0, lon: 12.5, type: "stop", name: "Cove", images: [] },
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

describe("PublicMap day segments", () => {
  it("draws one polyline per day, coloured via the segment's own color", () => {
    render(<PublicMap routes={[route()]} />)
    const polylineCalls = vi.mocked(Polyline).mock.calls
    expect(polylineCalls).toHaveLength(1)
    const props = polylineCalls[0][0]
    expect(props.positions).toEqual([
      [41.9, 12.4],
      [42.0, 12.5],
    ])
    expect(props.pathOptions).toMatchObject({ color: "#2272b6" })
  })

  it("skips a day segment with fewer than two points", () => {
    render(
      <PublicMap
        routes={[
          route({
            days: [
              daySegment({
                points: [{ lat: 41.9, lon: 12.4, type: "position", name: null, images: [] }],
              }),
            ],
          }),
        ]}
      />,
    )
    expect(vi.mocked(Polyline).mock.calls).toHaveLength(0)
  })

  it("renders a ring-icon marker per point, using the day's color and sequential stop numbering", () => {
    render(<PublicMap routes={[route()]} />)
    expect(ringIcon).toHaveBeenCalledWith("#2272b6", "position", undefined)
    expect(ringIcon).toHaveBeenCalledWith("#2272b6", "stop", 1)
    expect(vi.mocked(Marker).mock.calls).toHaveLength(2)
  })

  it("shows opted-in photos in the point's popup", () => {
    const { getAllByTestId } = render(
      <PublicMap
        routes={[
          route({
            days: [
              daySegment({
                points: [
                  {
                    lat: 41.9,
                    lon: 12.4,
                    type: "stop",
                    name: "Cove",
                    images: [{ url: "https://example.com/a.jpg" }],
                  },
                ],
              }),
            ],
          }),
        ]}
      />,
    )
    const popups = getAllByTestId("popup")
    expect(popups[0].querySelector("img")).not.toBeNull()
    expect(popups[0].querySelector("img")?.getAttribute("src")).toBe("https://example.com/a.jpg")
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
