import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import React from "react"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("leaflet", () => ({ default: {} }))
vi.mock("leaflet-velocity", () => ({}))

type MarkerProps = {
  point: { id?: string | null }
  routeMarker?: "start" | "finish" | null
}
const markerCaptures: MarkerProps[] = []
const routeMarkerFor = (id: string) =>
  markerCaptures.filter((p) => p.point.id === id).at(-1)?.routeMarker

vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => null,
  Polyline: () => null,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Circle: () => <div data-testid="draft-circle" />,
  useMap: vi.fn(() => ({
    getContainer: () => document.createElement("div"),
    invalidateSize: vi.fn(),
    fitBounds: vi.fn(),
  })),
  useMapEvents: () => null,
}))

vi.mock("../point-marker", () => ({
  PointMarker: (props: MarkerProps) => {
    markerCaptures.push(props)
    return <div data-testid="point-marker" data-id={props.point.id ?? ""} />
  },
}))
vi.mock("../ring-icon", () => ({ splitRingIcon: () => null }))
vi.mock("../tidal-diamond-marker", () => ({ TidalDiamondMarker: () => null }))
vi.mock("../tidal-diamond-form", () => ({ TidalDiamondForm: () => null }))
vi.mock("../wind-diamond-marker", () => ({ WindDiamondMarker: () => null }))
vi.mock("../wind-diamond-form", () => ({ WindDiamondForm: () => null }))
vi.mock("../hazard-position-marker", () => ({ HazardPositionMarker: () => null }))
vi.mock("@/components/weather/velocity-layer", () => ({ VelocityLayer: () => <div /> }))
vi.mock("@/components/map/chart", () => ({
  Graticule: () => null,
  ScaleBar: () => null,
  ForecastCellShell: () => null,
}))

vi.mock("@/lib/weather/actions", () => ({
  fetchWindVectors: vi.fn().mockResolvedValue({ success: false, error: "x" }),
  fetchWaveVectors: vi.fn().mockResolvedValue({ success: false, error: "x" }),
  fetchTidalDiamonds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchGlobalWindVectors: vi.fn().mockResolvedValue({ success: false, error: "x" }),
  createTidalDiamond: vi.fn().mockResolvedValue({ success: true, data: {} }),
  repositionTidalDiamond: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteTidalDiamond: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("@/lib/wind-diamonds/actions", () => ({
  fetchWindDiamonds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  createWindDiamond: vi.fn().mockResolvedValue({ success: true, data: {} }),
  updateWindDiamond: vi.fn().mockResolvedValue({ success: true, data: {} }),
  repositionWindDiamond: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteWindDiamond: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock("@/lib/map/hazard-positions/actions", () => ({
  fetchNearbyHazardPositions: vi.fn().mockResolvedValue({ success: true, data: [] }),
}))

import MapCore from "../map-core"

const DAYS: Day[] = [{ id: "day-1", order: 1 } as Day, { id: "day-2", order: 2 } as Day]

const POINTS: Point[] = [
  { id: "p1", type: "stop", latitude: 43.0, longitude: 13.0, dayId: "day-1", nextId: "p2" },
  { id: "p2", type: "position", latitude: 43.1, longitude: 13.1, dayId: "day-1", nextId: "p3" },
  { id: "p3", type: "stop", latitude: 43.2, longitude: 13.2, dayId: "day-2", nextId: "p4" },
  { id: "p4", type: "stop", latitude: 43.3, longitude: 13.3, dayId: "day-2", nextId: null },
] as Point[]

const BASE_PROPS = {
  points: POINTS,
  days: DAYS,
  distanceUnit: "nm" as const,
  viewMode: true,
  onMapClick: vi.fn(),
  onMarkerDragEnd: vi.fn(),
  onMarkerDragMove: vi.fn(),
}

beforeEach(() => {
  markerCaptures.length = 0
  vi.clearAllMocks()
})

describe("MapCore — route start/finish markers", () => {
  it("marks only the first point of the whole route as start", async () => {
    render(<MapCore {...BASE_PROPS} />)
    await waitFor(() => expect(screen.getAllByTestId("point-marker").length).toBe(4))

    expect(routeMarkerFor("p1")).toBe("start")
    expect(routeMarkerFor("p2")).toBeFalsy()
    expect(routeMarkerFor("p3")).toBeFalsy()
  })

  it("marks only the last point of the whole route as finish, not a day boundary mid-route", async () => {
    render(<MapCore {...BASE_PROPS} />)
    await waitFor(() => expect(screen.getAllByTestId("point-marker").length).toBe(4))

    expect(routeMarkerFor("p4")).toBe("finish")
    expect(routeMarkerFor("p3")).toBeFalsy()
  })

  it("marks a single-point route as start only, not finish", async () => {
    render(<MapCore {...BASE_PROPS} points={[POINTS[0]]} days={[DAYS[0]]} />)
    await waitFor(() => expect(screen.getAllByTestId("point-marker").length).toBe(1))

    expect(routeMarkerFor("p1")).toBe("start")
  })
})
