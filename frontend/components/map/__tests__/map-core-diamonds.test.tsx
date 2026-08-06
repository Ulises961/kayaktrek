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

// Capture the props MapCore passes to each diamond marker so tests can assert
// edit-gating and fire the drag/delete callbacks the real marker would emit.
type MarkerProps = {
  diamond: { id: string; isUserCreated: boolean }
  editable?: boolean
  onDragEnd?: (lat: number, lng: number) => void
  onDelete?: () => void
}
const markerCaptures: MarkerProps[] = []
const latestMarkerFor = (id: string) => markerCaptures.filter((p) => p.diamond.id === id).at(-1)!

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
  TidalDiamondMarker: (props: MarkerProps) => {
    markerCaptures.push(props)
    return (
      <div
        data-testid="diamond-marker"
        data-id={props.diamond.id}
        data-editable={props.editable ? "true" : "false"}
      />
    )
  },
}))

// Stand-in form: one button that emits a valid simple-mode entry on submit, plus
// the real component's error rendering so a failed submit is actually observable.
vi.mock("../tidal-diamond-form", () => ({
  TidalDiamondForm: ({
    onSubmit,
    error,
  }: {
    onSubmit: (f: unknown) => void
    error?: string | null
  }) => (
    <div>
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
      {error && <p data-testid="form-error">{error}</p>}
    </div>
  ),
}))

vi.mock("@/components/weather/velocity-layer", () => ({ VelocityLayer: () => <div /> }))

// Chart furniture touches Leaflet internals this suite stubs out — mock it away.
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

import MapCore from "../map-core"
import {
  createTidalDiamond,
  fetchTidalDiamonds,
  repositionTidalDiamond,
  deleteTidalDiamond,
} from "@/lib/weather/actions"

const CREATE = createTidalDiamond as ReturnType<typeof vi.fn>
const FETCH = fetchTidalDiamonds as ReturnType<typeof vi.fn>
const REPOSITION = repositionTidalDiamond as ReturnType<typeof vi.fn>
const DELETE = deleteTidalDiamond as ReturnType<typeof vi.fn>

const USER_DIAMOND = {
  id: "01952f1a-0000-7000-8000-000000000099",
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
const ATLAS_DIAMOND = { ...USER_DIAMOND, id: "atlas-1", source: "atlas", isUserCreated: false }

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
  markerCaptures.length = 0
  vi.clearAllMocks()
  // clearAllMocks keeps factory implementations; reset the diamond fetch to the
  // empty default so a per-test override never leaks into the next test.
  FETCH.mockResolvedValue({ success: true, data: [] })
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

  it("shows the create error in the dialog and keeps it open instead of closing on failure", async () => {
    CREATE.mockResolvedValueOnce({ success: false, error: "That location is inland." })
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" canManageDiamonds />)

    fireEvent.click(await screen.findByTestId("add-diamond-button"))
    await waitFor(() => expect(clickHandlers.length).toBeGreaterThan(0))
    act(() => clickHandlers[clickHandlers.length - 1]({ latlng: { lat: 50, lng: -4 } }))
    fireEvent.click(await screen.findByTestId("form-submit"))

    await waitFor(() => expect(CREATE).toHaveBeenCalled())
    expect(await screen.findByTestId("form-error")).toHaveTextContent("That location is inland.")
    // The dialog stays open on failure — closeDialog/reloadDiamonds only run on success.
    expect(screen.getByTestId("form-submit")).toBeInTheDocument()
  })

  it("repositions a user diamond on drag and re-fetches", async () => {
    FETCH.mockResolvedValue({ success: true, data: [USER_DIAMOND] })
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" canManageDiamonds />)

    await screen.findByTestId("diamond-marker")
    const props = latestMarkerFor(USER_DIAMOND.id)
    expect(props.editable).toBe(true)

    await act(async () => {
      props.onDragEnd?.(51, -5)
    })
    await waitFor(() => expect(REPOSITION).toHaveBeenCalledWith(USER_DIAMOND.id, 51, -5))
    // The mutation funnels back through reloadDiamonds → the initial fetch plus
    // the post-mutation refetch.
    expect(FETCH.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it("deletes a user diamond from the popup control", async () => {
    FETCH.mockResolvedValue({ success: true, data: [USER_DIAMOND] })
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" canManageDiamonds />)

    await screen.findByTestId("diamond-marker")
    await act(async () => {
      latestMarkerFor(USER_DIAMOND.id).onDelete?.()
    })
    await waitFor(() => expect(DELETE).toHaveBeenCalledWith(USER_DIAMOND.id))
  })

  it("keeps atlas (non-user) diamonds read-only even with manage permission", async () => {
    FETCH.mockResolvedValue({ success: true, data: [ATLAS_DIAMOND] })
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" canManageDiamonds />)

    await screen.findByTestId("diamond-marker")
    expect(latestMarkerFor(ATLAS_DIAMOND.id).editable).toBe(false)
  })

  it("does not make diamonds editable without manage permission", async () => {
    FETCH.mockResolvedValue({ success: true, data: [USER_DIAMOND] })
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" itineraryId="itin-1" />)

    await screen.findByTestId("diamond-marker")
    expect(latestMarkerFor(USER_DIAMOND.id).editable).toBe(false)
  })
})
