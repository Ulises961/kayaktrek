import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import React from "react"
import type { RouteData, RouteDaySegment } from "@/lib/itinerary/public-routes"

const { fitBounds, latLngBounds, invalidateSize, mapContainer } = vi.hoisted(() => ({
  fitBounds: vi.fn(),
  invalidateSize: vi.fn(),
  latLngBounds: vi.fn((positions: [number, number][]) => ({ __mockBounds: positions })),
  mapContainer: { __mockContainer: true },
}))

vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("leaflet", () => ({ default: { latLngBounds } }))

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  useMap: vi.fn(() => ({ fitBounds, invalidateSize, getContainer: () => mapContainer })),
}))

// Captures what the ResizeHandler observes and the callback it registers, so the
// resize can be fired without a layout engine.
const observed: unknown[] = []
let onResize: (() => void) | null = null
globalThis.ResizeObserver = class {
  constructor(callback: () => void) {
    onResize = callback
  }
  observe(target: unknown) {
    observed.push(target)
  }
  unobserve() {}
  disconnect() {
    onResize = null
  }
} as unknown as typeof ResizeObserver

const { RouteDayLayers } = vi.hoisted(() => ({ RouteDayLayers: vi.fn(() => null) }))
vi.mock("@/components/map/route-day-layers", () => ({ RouteDayLayers }))

const { LivePositionLayer } = vi.hoisted(() => ({ LivePositionLayer: vi.fn(() => null) }))
vi.mock("@/components/map/live-position-layer", () => ({ LivePositionLayer }))

import PublicMap from "../public-map"
import type { LivePosition } from "@/lib/dtos/live-position"

function daySegment(overrides: Partial<RouteDaySegment> = {}): RouteDaySegment {
  return {
    dayNumber: 1,
    date: "2026-07-01",
    color: "#2272b6",
    distanceNm: 1.2,
    points: [
      { id: "p1", lat: 41.9, lon: 12.4, type: "position", name: null, images: [], pointNumber: 1 },
      { id: "p2", lat: 42.0, lon: 12.5, type: "stop", name: "Cove", images: [], pointNumber: 2 },
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
    boundaryColors: {},
    totalMiles: 12,
    dayCount: 1,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  observed.length = 0
  onResize = null
})

const LIVE_POSITION: LivePosition = {
  userId: "u1",
  name: "Alex",
  lat: 41.95,
  lon: 12.45,
  accuracyM: 5,
  headingDeg: 90,
  speedMs: 1.2,
  recordedAt: "2026-08-01T10:00:00Z",
}

describe("PublicMap", () => {
  it("renders the day-coloured route layers with the given routes", () => {
    render(<PublicMap routes={[route()]} />)
    expect(RouteDayLayers).toHaveBeenCalledWith(
      expect.objectContaining({ routes: [route()] }),
      undefined,
    )
  })

  it("passes live positions through to the live position layer", () => {
    render(<PublicMap routes={[route()]} livePositions={[LIVE_POSITION]} />)
    expect(LivePositionLayer).toHaveBeenCalledWith(
      expect.objectContaining({ positions: [LIVE_POSITION] }),
      undefined,
    )
  })

  it("passes an empty live positions array through by default", () => {
    render(<PublicMap routes={[route()]} />)
    expect(LivePositionLayer).toHaveBeenCalledWith(
      expect.objectContaining({ positions: [] }),
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

describe("PublicMap resize handling", () => {
  it("tells Leaflet to remeasure when its container is resized", () => {
    render(<PublicMap routes={[route()]} />)

    // The public pages dock the route panel beside this map and collapse it on a
    // toggle, which changes the map's width with no window resize behind it.
    // Leaflet only watches the window, so without this the strip it just gained
    // stays grey.
    expect(observed).toEqual([mapContainer])
    onResize!()
    expect(invalidateSize).toHaveBeenCalledWith({ animate: false })
  })
})
