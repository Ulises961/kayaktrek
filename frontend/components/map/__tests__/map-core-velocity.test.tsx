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
  })),
  useMapEvents: vi.fn(() => null),
}))

vi.mock("../point-marker", () => ({ PointMarker: () => null }))
vi.mock("../ring-icon", () => ({ splitRingIcon: () => null }))

vi.mock("@/components/weather/velocity-layer", () => ({
  VelocityLayer: ({ data }: { data: unknown[] }) => (
    <div data-testid="velocity-layer" data-layers={data.length} />
  ),
}))

vi.mock("@/lib/weather/actions", () => ({
  fetchWindVectors: vi.fn(),
  fetchWaveVectors: vi.fn(),
  fetchTidalStreamVectors: vi.fn(),
  fetchGlobalWindVectors: vi.fn(),
}))

import MapCore from "../map-core"
import {
  fetchWindVectors,
  fetchWaveVectors,
  fetchTidalStreamVectors,
  fetchGlobalWindVectors,
} from "@/lib/weather/actions"
import type { VelocityGridLayer } from "@/lib/types/ui"

const WIND = fetchWindVectors as ReturnType<typeof vi.fn>
const SWELL = fetchWaveVectors as ReturnType<typeof vi.fn>
const TIDAL = fetchTidalStreamVectors as ReturnType<typeof vi.fn>
const GLOBAL = fetchGlobalWindVectors as ReturnType<typeof vi.fn>

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
  TIDAL.mockResolvedValue({ success: false, error: "no data" })
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
    TIDAL.mockResolvedValue({ success: true, data: { grid: [] } })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={12} />)

    await waitFor(() => expect(WIND).toHaveBeenCalledWith("day-1", 12))
    expect(screen.getByTestId("wind-toggle")).toBeInTheDocument()
    expect(screen.getByTestId("swell-toggle")).toBeInTheDocument()
  })

  it("renders wind and swell VelocityLayer components when data is fetched", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    TIDAL.mockResolvedValue({ success: true, data: { grid: [] } })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={12} />)

    await waitFor(() => {
      expect(screen.getAllByTestId("velocity-layer")).toHaveLength(2)
    })
  })

  it("hides the tidal stream toggle when tidal grid is empty", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    TIDAL.mockResolvedValue({ success: true, data: { grid: [] } })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)

    await waitFor(() => expect(WIND).toHaveBeenCalled())
    expect(screen.queryByTestId("tidal-toggle")).not.toBeInTheDocument()
  })

  it("shows the tidal stream toggle and source label when tidal grid has data", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    TIDAL.mockResolvedValue({
      success: true,
      data: { source: "station", grid: [GRID_LAYER] },
    })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)

    const tidalToggle = await screen.findByTestId("tidal-toggle")
    expect(tidalToggle).toHaveTextContent("atlas")
  })

  it("shows (manual) label when tidal source is manual", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    TIDAL.mockResolvedValue({
      success: true,
      data: { source: "manual", grid: [GRID_LAYER] },
    })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)

    const tidalToggle = await screen.findByTestId("tidal-toggle")
    expect(tidalToggle).toHaveTextContent("manual")
  })

  it("re-fetches with the new hour when selectedHour prop changes", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    TIDAL.mockResolvedValue({ success: false, error: "x" })

    const { rerender } = render(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={12} />)
    await waitFor(() => expect(WIND).toHaveBeenCalledWith("day-1", 12))

    vi.clearAllMocks()
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    TIDAL.mockResolvedValue({ success: false, error: "x" })

    rerender(<MapCore {...BASE_PROPS} selectedDayId="day-1" selectedHour={18} />)
    await waitFor(() => expect(WIND).toHaveBeenCalledWith("day-1", 18))
  })

  it("clears layer data when selectedDayId becomes null", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    TIDAL.mockResolvedValue({ success: false, error: "x" })

    const { rerender } = render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)
    await waitFor(() => expect(screen.getAllByTestId("velocity-layer")).toHaveLength(2))

    rerender(<MapCore {...BASE_PROPS} selectedDayId={null} />)
    expect(screen.queryByTestId("velocity-layer")).not.toBeInTheDocument()
  })

  it("toggles the wind layer off when wind button is clicked", async () => {
    WIND.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    TIDAL.mockResolvedValue({ success: false, error: "x" })

    render(<MapCore {...BASE_PROPS} selectedDayId="day-1" />)
    await waitFor(() => expect(screen.getByTestId("velocity-layer")).toBeInTheDocument())

    fireEvent.click(screen.getByTestId("wind-toggle"))
    expect(screen.queryByTestId("velocity-layer")).not.toBeInTheDocument()
  })

  it("fetches global wind vectors when a day with a date is selected", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    TIDAL.mockResolvedValue({ success: false, error: "x" })
    GLOBAL.mockResolvedValue({ success: false, error: "x" })

    const daysWithDate = [{ id: "day-1", dayNumber: 1, date: "2026-07-15" }]
    render(<MapCore {...BASE_PROPS} days={daysWithDate} selectedDayId="day-1" selectedHour={12} />)

    await waitFor(() => expect(GLOBAL).toHaveBeenCalledWith("2026-07-15", 12))
  })

  it("renders a global wind VelocityLayer when global data arrives", async () => {
    WIND.mockResolvedValue({ success: false, error: "x" })
    SWELL.mockResolvedValue({ success: false, error: "x" })
    TIDAL.mockResolvedValue({ success: false, error: "x" })
    GLOBAL.mockResolvedValue({ success: true, data: { grid: [GRID_LAYER] } })

    const daysWithDate = [{ id: "day-1", dayNumber: 1, date: "2026-07-15" }]
    render(<MapCore {...BASE_PROPS} days={daysWithDate} selectedDayId="day-1" />)

    await waitFor(() => expect(screen.getByTestId("velocity-layer")).toBeInTheDocument())
  })
})
