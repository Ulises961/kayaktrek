import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
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
  useMap: vi.fn(() => ({
    removeLayer: vi.fn(),
    getContainer: () => document.createElement("div"),
    invalidateSize: vi.fn(),
    fitBounds: vi.fn(),
  })),
  useMapEvents: vi.fn(() => null),
}))

vi.mock("../point-marker", () => ({ PointMarker: () => null }))
vi.mock("../ring-icon", () => ({ splitRingIcon: () => null }))
vi.mock("../tidal-diamond-marker", () => ({
  TidalDiamondMarker: () => <div data-testid="diamond-marker" />,
}))

vi.mock("@/components/weather/velocity-layer", () => ({
  VelocityLayer: ({ data }: { data: unknown[] }) => (
    <div data-testid="velocity-layer" data-layers={data.length} />
  ),
}))

// Chart furniture touches Leaflet internals (L.Control, useMap bounds) that this
// suite stubs out, so mock the module. The shell reports how many velocity fields
// it wraps via data-layers.
vi.mock("@/components/map/chart", () => ({
  Graticule: () => <div data-testid="graticule" />,
  ScaleBar: () => <div data-testid="scale-bar" />,
  ForecastCellShell: ({ layers }: { layers: unknown[] }) => (
    <div data-testid="forecast-cell" data-layers={layers.length} />
  ),
}))

vi.mock("@/lib/weather/actions", () => ({
  fetchWindVectors: vi.fn(),
  fetchWaveVectors: vi.fn(),
  fetchTidalDiamonds: vi.fn(),
  fetchGlobalWindVectors: vi.fn(),
}))

import MapCore from "../map-core"
import {
  fetchWindVectors,
  fetchWaveVectors,
  fetchTidalDiamonds,
  fetchGlobalWindVectors,
} from "@/lib/weather/actions"
import type { VelocityGridLayer } from "@/lib/types/ui"
import type { Point } from "@/lib/dtos/point"

// A single located route point on the selected day — enough to derive a forecast
// cell disc (points=[] falls back to bare, unclipped velocity layers).
const ROUTE_POINT = {
  id: "p1",
  dayId: "day-1",
  latitude: 50.3,
  longitude: -4.1,
} as unknown as Point

const WIND = fetchWindVectors as ReturnType<typeof vi.fn>
const SWELL = fetchWaveVectors as ReturnType<typeof vi.fn>
const DIAMONDS = fetchTidalDiamonds as ReturnType<typeof vi.fn>
const GLOBAL = fetchGlobalWindVectors as ReturnType<typeof vi.fn>

const DIAMOND = {
  id: "01952f1a-0000-7000-8000-000000000020",
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

const GRID_LAYER: VelocityGridLayer = {
  header: {
    parameterUnit: "m/s",
    parameterCategory: 2,
    parameterNumber: 2,
    parameterNumberName: "eastward_wind",
    la1: 40,
    la2: 50,
    lo1: 10,
    lo2: 20,
    nx: 2,
    ny: 2,
    dx: 5,
    dy: 5,
  },
  data: [1, 2, 3, 4],
}

const BASE_PROPS = {
  points: [],
  days: [],
  distanceUnit: "nm" as const,
  onMapClick: vi.fn(),
  onMarkerDragEnd: vi.fn(),
  onMarkerDragMove: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  WIND.mockResolvedValue({ success: false, error: "no data" })
  SWELL.mockResolvedValue({ success: false, error: "no data" })
  DIAMONDS.mockResolvedValue({ success: true, data: [] })
  GLOBAL.mockResolvedValue({ success: false, error: "no data" })
})

describe("MapCore — velocity layer controls", () => {
  it("does not render velocity controls when no day is selected", () => {
    render(<MapCore {...BASE_PROPS} selectedDayId={null} />)
    expect(screen.queryByTestId("velocity-controls")).not.toBeInTheDocument()
  })

  it("renders wind and swell toggle buttons when a day is selected", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={12} />)

    await waitFor(() => expect(WIND).toHaveBeenCalledWith("day-1", 12))
    expect(screen.getByTestId("wind-toggle")).toBeInTheDocument()
    expect(screen.getByTestId("swell-toggle")).toBeInTheDocument()
  })

  it("renders wind and swell VelocityLayer components when data is fetched", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={12} />)

    await waitFor(() => {
      expect(screen.getAllByTestId("velocity-layer")).toHaveLength(2)
    })
  })

  it("hides the diamonds toggle when there are no diamonds", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)

    await waitFor(() => expect(WIND).toHaveBeenCalled())
    expect(screen.queryByTestId("diamonds-toggle")).not.toBeInTheDocument()
  })

  it("shows the diamonds toggle and renders a marker per diamond when present", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    DIAMONDS.mockResolvedValue({ success: true, data: [DIAMOND, { ...DIAMOND, id: "x2" }] })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)

    expect(await screen.findByTestId("diamonds-toggle")).toHaveTextContent("Tidal diamonds")
    expect(screen.getAllByTestId("diamond-marker")).toHaveLength(2)
  })

  it("hides diamond markers when the diamonds layer is toggled off", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    DIAMONDS.mockResolvedValue({ success: true, data: [DIAMOND] })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)
    await waitFor(() => expect(screen.getByTestId("diamond-marker")).toBeInTheDocument())

    fireEvent.click(screen.getByTestId("diamonds-toggle"))
    expect(screen.queryByTestId("diamond-marker")).not.toBeInTheDocument()
  })

  it("re-fetches with the new hour when selectedHour prop changes", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })

    const { rerender } = render(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={12} />)
    await waitFor(() => expect(WIND).toHaveBeenCalledWith("day-1", 12))

    vi.clearAllMocks()
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })

    rerender(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={18} />)
    await waitFor(() => expect(WIND).toHaveBeenCalledWith("day-1", 18))
  })

  it("clears layer data when selectedDayId becomes null", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })

    const { rerender } = render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)
    await waitFor(() => expect(screen.getAllByTestId("velocity-layer")).toHaveLength(2))

    rerender(<MapCore {...BASE_PROPS} selectedDayId={null} />)
    expect(screen.queryByTestId("velocity-layer")).not.toBeInTheDocument()
  })

  it("toggles the wind layer off when wind button is clicked", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)
    await waitFor(() => expect(screen.getByTestId("velocity-layer")).toBeInTheDocument())

    fireEvent.click(screen.getByTestId("wind-toggle"))
    expect(screen.queryByTestId("velocity-layer")).not.toBeInTheDocument()
  })

  it("fetches global wind vectors when a day with a date is selected", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })
    GLOBAL.mockResolvedValue({ success: false, error: "x" })

    const daysWithDate = [{ id: "day-1", dayNumber: 1, date: "2026-07-15" }]
    render(<MapCore {...BASE_PROPS} days={daysWithDate} selectedDayId="day-1" selectedHour={12} />)

    await waitFor(() => expect(GLOBAL).toHaveBeenCalledWith("2026-07-15", 12))
  })

  it("renders a global wind VelocityLayer when global data arrives", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    DIAMONDS.mockResolvedValue({ success: true, data: [] })
    GLOBAL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })

    const daysWithDate = [{ id: "day-1", dayNumber: 1, date: "2026-07-15" }]
    render(<MapCore {...BASE_PROPS} days={daysWithDate} selectedDayId="day-1" />)

    await waitFor(() => expect(screen.getByTestId("velocity-layer")).toBeInTheDocument())
  })

  it("wraps wind and swell in a single forecast cell for a routed day", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })

    render(
      <MapCore {...BASE_PROPS} points={[ROUTE_POINT]} selectedDayId="day-1" selectedHour={12} />,
    )

    const cell = await screen.findByTestId("forecast-cell")
    // One cell (one disc + ring), wrapping both the wind and swell fields.
    expect(cell).toHaveAttribute("data-layers", "2")
  })

  it("the forecast cell carries only the active layers", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: false, error: "x" })

    render(
      <MapCore {...BASE_PROPS} points={[ROUTE_POINT]} selectedDayId="day-1" selectedHour={12} />,
    )

    const cell = await screen.findByTestId("forecast-cell")
    expect(cell).toHaveAttribute("data-layers", "1")
  })

  it("renders the graticule and scale bar chart furniture", async () => {
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)
    expect(await screen.findByTestId("graticule")).toBeInTheDocument()
    expect(screen.getByTestId("scale-bar")).toBeInTheDocument()
  })

  it("degrades to no velocity overlay, without crashing, when every vector fetch fails", async () => {
    // beforeEach already fails wind/swell/global and resolves diamonds empty —
    // the map's default state whenever the backend has no data for a day yet.
    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={12} />)

    await waitFor(() => expect(WIND).toHaveBeenCalled())
    expect(screen.queryByTestId("velocity-layer")).not.toBeInTheDocument()
    expect(screen.queryByTestId("forecast-cell")).not.toBeInTheDocument()
    expect(screen.queryByTestId("diamond-marker")).not.toBeInTheDocument()
    // The toggles themselves are keyed off day-selection, not fetch success —
    // they still render so the user can tell overlays exist, just have no data.
    expect(screen.getByTestId("wind-toggle")).toBeInTheDocument()
  })
})
