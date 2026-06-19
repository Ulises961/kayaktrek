import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react"
import React from "react"

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("leaflet/dist/leaflet.css", () => ({}))
vi.mock("leaflet", () => ({ default: {} }))
vi.mock("leaflet-velocity", () => ({}))

// Capture every click handler registered through useMapEvents so a test can fire
// the DiamondPlacer's map click directly (Leaflet itself isn't running here).
const clickHandlers: Array<(e: { latlng: { lat: number; lng: number } }) => void> = []

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
  })),
  useMapEvents: (handlers: { click?: (e: { latlng: { lat: number; lng: number } }) => void }) => {
    if (handlers.click) clickHandlers.push(handlers.click)
    return null
  },
}))

vi.mock("../point-marker", () => ({ PointMarker: () => null }))
vi.mock("../ring-icon", () => ({ splitRingIcon: () => null }))
vi.mock("../tidal-diamond-marker", () => ({
  TidalDiamondMarker: () => <div data-testid="diamond-marker" />,
}))

// Stand-in form: one button that emits a valid simple-mode entry on submit.
vi.mock("../tidal-diamond-form", () => ({
  TidalDiamondForm: ({ onSubmit }: { onSubmit: (f: unknown) => void }) => (
    <button
      data-testid="form-submit"
      onClick={() =>
        onSubmit({
          name: "The Race",
          entryMode: "simple",
          radiusM: 500,
          maxSpringRateKnots: 3,
          floodDirectionDegrees: 45,
          ebbDirectionDegrees: 225,
        })
      }
    >
      submit
    </button>
  ),
}))

vi.mock("@/components/weather/velocity-layer", () => ({ VelocityLayer: () => <div /> }))

vi.mock("@/lib/weather/actions", () => ({
  fetchWindVectors: vi.fn().mockResolvedValue({ success: false, error: "x" }),
  fetchWaveVectors: vi.fn().mockResolvedValue({ success: false, error: "x" }),
  fetchTidalDiamonds: vi.fn().mockResolvedValue({ success: true, data: [] }),
  fetchGlobalWindVectors: vi.fn().mockResolvedValue({ success: false, error: "x" }),
  createTidalDiamond: vi.fn().mockResolvedValue({ success: true, data: {} }),
  repositionTidalDiamond: vi.fn().mockResolvedValue({ success: true, data: {} }),
  deleteTidalDiamond: vi.fn().mockResolvedValue({ success: true }),
}))

import MapCore from "../map-core"
import { createTidalDiamond } from "@/lib/weather/actions"

const CREATE = createTidalDiamond as ReturnType<typeof vi.fn>

const BASE_PROPS = {
  points: [],
  days: [],
  distanceUnit: "nm" as const,
  viewMode: true,
  onMapClick: vi.fn(),
  onMarkerDragEnd: vi.fn(),
  onMarkerDragMove: vi.fn(),
}

beforeEach(() => {
  clickHandlers.length = 0
  vi.clearAllMocks()
})

describe("MapCore — tidal diamond placement", () => {
  it("hides the add affordance without manage permission", () => {
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" />)
    expect(screen.queryByTestId("add-diamond-button")).not.toBeInTheDocument()
  })

  it("hides the add affordance until a day is selected", () => {
    render(<MapCore {...BASE_PROPS} selectedDayId={null} itineraryId="itin-1" canManageDiamonds />)
    expect(screen.queryByTestId("add-diamond-button")).not.toBeInTheDocument()
  })

  it("places a pin then creates a diamond at the clicked location", async () => {
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" canManageDiamonds />)

    fireEvent.click(await screen.findByTestId("add-diamond-button"))

    // Entering placing mode mounts the DiamondPlacer, registering its click handler.
    await waitFor(() => expect(clickHandlers.length).toBeGreaterThan(0))
    act(() => clickHandlers[clickHandlers.length - 1]({ latlng: { lat: 50, lng: -4 } }))

    fireEvent.click(await screen.findByTestId("form-submit"))

    await waitFor(() =>
      expect(CREATE).toHaveBeenCalledWith(
        "itin-1",
        50,
        -4,
        expect.objectContaining({ name: "The Race", entryMode: "simple" }),
      ),
    )
  })
})
