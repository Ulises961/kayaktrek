import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import React from "react"

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("leaflet", () => ({ default: {} }))
vi.mock("leaflet-velocity", () => ({}))

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

vi.mock("../point-marker", () => ({ PointMarker: () => null }))
vi.mock("../ring-icon", () => ({ splitRingIcon: () => null }))

vi.mock("../tidal-diamond-marker", () => ({
  TidalDiamondMarker: ({ diamond }: { diamond: { id: string } }) => (
    <div data-testid="tidal-diamond-marker" data-id={diamond.id} />
  ),
}))
vi.mock("../tidal-diamond-form", () => ({ TidalDiamondForm: () => null }))

vi.mock("../wind-diamond-marker", () => ({
  WindDiamondMarker: ({ diamond }: { diamond: { id: string } }) => (
    <div data-testid="wind-diamond-marker" data-id={diamond.id} />
  ),
}))
vi.mock("../wind-diamond-form", () => ({ WindDiamondForm: () => null }))

vi.mock("../hazard-position-marker", () => ({
  HazardPositionMarker: ({ position }: { position: { id: string; kind: string } }) => (
    <div data-testid="hazard-position-marker" data-id={position.id} data-kind={position.kind} />
  ),
}))

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
  fetchNearbyHazardPositions: vi.fn(),
}))

import MapCore from "../map-core"
import { fetchTidalDiamonds } from "@/lib/weather/actions"
import { fetchWindDiamonds } from "@/lib/wind-diamonds/actions"
import { fetchNearbyHazardPositions } from "@/lib/map/hazard-positions/actions"

const FETCH_TIDAL = fetchTidalDiamonds as ReturnType<typeof vi.fn>
const FETCH_WIND = fetchWindDiamonds as ReturnType<typeof vi.fn>
const FETCH_HAZARDS = fetchNearbyHazardPositions as ReturnType<typeof vi.fn>

const OWN_TIDAL = {
  id: "01952f1a-0000-7000-8000-000000000001",
  name: "Race",
  lat: 50.3,
  lng: -4.1,
  directionDegrees: 225,
  rateKnots: 1.8,
  source: "simple",
  radiusM: 500,
  isUserCreated: true,
  hourlyTable: [],
}

const OWN_WIND = {
  id: "01952f1a-0000-7000-8000-000000000002",
  name: "Funnel off the ridge",
  location: { type: "Point" as const, coordinates: [-4.1, 50.3] as [number, number] },
  notes: null,
  itineraryId: "itin-1",
  createdByUserId: "user-1",
}

const BASE_PROPS = {
  points: [{ id: "p1", latitude: 50.3, longitude: -4.1 } as never],
  days: [],
  distanceUnit: "nm" as const,
  viewMode: true,
  onMapClick: vi.fn(),
  onMarkerDragEnd: vi.fn(),
  onMarkerDragMove: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  FETCH_TIDAL.mockResolvedValue({ success: true, data: [] })
  FETCH_WIND.mockResolvedValue({ success: true, data: [] })
  FETCH_HAZARDS.mockResolvedValue({ success: true, data: [] })
})

describe("MapCore — cross-trip hazard positions vs. own diamonds", () => {
  it("does not render a hazard-position pin for a diamond this trip already owns", async () => {
    FETCH_TIDAL.mockResolvedValue({ success: true, data: [OWN_TIDAL] })
    FETCH_WIND.mockResolvedValue({ success: true, data: [OWN_WIND] })
    FETCH_HAZARDS.mockResolvedValue({
      success: true,
      data: [
        { id: OWN_TIDAL.id, lat: OWN_TIDAL.lat, lng: OWN_TIDAL.lng, kind: "tidal" },
        {
          id: OWN_WIND.id,
          lat: OWN_WIND.location.coordinates[1],
          lng: OWN_WIND.location.coordinates[0],
          kind: "wind",
        },
        { id: "other-trip-diamond", lat: 51, lng: -3, kind: "wind" },
      ],
    })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" />)

    await screen.findByTestId("tidal-diamond-marker")
    await screen.findByTestId("wind-diamond-marker")

    await waitFor(() =>
      expect(screen.getByTestId("hazard-position-marker")).toHaveAttribute(
        "data-id",
        "other-trip-diamond",
      ),
    )
    expect(screen.getAllByTestId("hazard-position-marker")).toHaveLength(1)
  })
})
