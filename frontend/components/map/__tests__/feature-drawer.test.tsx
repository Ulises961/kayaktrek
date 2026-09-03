import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Day } from "@/lib/dtos/day"
import type { Point } from "@/lib/dtos/point"
import { legLabel } from "@/lib/itinerary/distance"

vi.mock("@/lib/weather/actions", () => ({
  fetchDayWeather: vi.fn().mockResolvedValue({ success: false }),
  fetchDaySea: vi.fn().mockResolvedValue({ success: false }),
  fetchTidalGates: vi.fn().mockResolvedValue({ success: false }),
  // Default to failure like every other action mocked here. success:true would send
  // useDayConditions().refresh() into its real-timer 2s×10 poll loop, which outlives
  // the test that triggered it (RTL cleanup unmounts but doesn't cancel the pending
  // setTimeout chain) and can steal a later test's mockResolvedValueOnce — override
  // per test when a specific value matters.
  triggerWeatherFetch: vi.fn().mockResolvedValue({ success: false }),
}))

vi.mock("@/components/weather/weather-grid", () => ({
  WeatherGrid: () => <div data-testid="weather-grid" />,
}))

vi.mock("@/components/weather/sea-grid", () => ({
  SeaGrid: () => <div data-testid="sea-grid" />,
}))

vi.mock("@/components/weather/tidal-entry-form", () => ({
  TidalEntryForm: () => <div data-testid="tidal-entry-form" />,
}))

vi.mock("@/components/weather/rule-of-twelfths-table", () => ({
  RuleOfTwelfthsTable: () => <div data-testid="rule-of-twelfths-table" />,
}))

vi.mock("@/components/weather/tidal-gate-warnings", () => ({
  TidalGateWarnings: () => <div data-testid="tidal-gate-warnings" />,
}))

import { FeatureDrawer } from "../feature-drawer"

const DAY1_ID = "day-1"
const ITIN_ID = "itin-1"

const pt = (id: string, dayId: string, extra: Partial<Point> = {}): Point => ({
  id,
  type: "position",
  latitude: 44,
  longitude: 14,
  dayId,
  ...extra,
})

const day = (id: string, dayNumber: number, extra: Partial<Day> = {}): Day => ({
  id,
  dayNumber,
  itineraryId: ITIN_ID,
  ...extra,
})

function makeCtx(overrides: Partial<MapBuilderContextValue> = {}): MapBuilderContextValue {
  const state: MapState = {
    points: [pt("p1", DAY1_ID, { name: "Start" }), pt("p2", DAY1_ID, { name: "End" })],
    pointOrder: ["p1", "p2"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [day(DAY1_ID, 1)],
    ...(overrides.state as Partial<MapState>),
  }
  return {
    state,
    dispatch: vi.fn(),
    draft: null,
    setDraft: vi.fn(),
    removedRealDayIds: [],
    setRemovedRealDayIds: vi.fn(),
    tripId: null,
    tripName: "Test Trip",
    tripDateFrom: null,
    tripDateTo: null,
    itineraryId: ITIN_ID,
    distanceUnit: "nm",
    setDistanceUnit: vi.fn(),
    avgSpeedKnots: 2.5,
    setAvgSpeedKnots: vi.fn(),
    day0Id: "day-0",
    resolveDay0Id: vi.fn(async () => "day-0"),
    viewMode: true,
    setViewMode: vi.fn(),
    selectedDayId: null,
    setSelectedDayId: vi.fn(),
    tripState: null,
    isLeader: true,
    selectedPointId: null,
    setSelectedPointId: vi.fn(),
    selectedHour: 12,
    setSelectedHour: vi.fn(),
    conditionsVersion: 0,
    bumpConditions: vi.fn(),
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(
    createElement(MapBuilderContext.Provider, { value: ctx }, createElement(FeatureDrawer)),
  )
}

beforeEach(() => vi.clearAllMocks())

// ─── visibility ───────────────────────────────────────────────────────────────

describe("FeatureDrawer — visibility", () => {
  it("renders nothing when selectedDayId is null (reclaims map space)", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByTestId("feature-drawer")).not.toBeInTheDocument()
  })

  it("renders as a layout sibling when selectedDayId is set", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    expect(screen.getByTestId("feature-drawer")).toBeInTheDocument()
  })
})

// ─── header ───────────────────────────────────────────────────────────────────

describe("FeatureDrawer — header", () => {
  it("shows the day number in the header when a day is selected", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    expect(screen.getByText("Day 1")).toBeInTheDocument()
  })

  it("close button calls setSelectedDayId(null)", async () => {
    const setSelectedDayId = vi.fn()
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID, setSelectedDayId }))
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(setSelectedDayId).toHaveBeenCalledWith(null)
  })
})

// ─── tabs ─────────────────────────────────────────────────────────────────────

describe("FeatureDrawer — tabs", () => {
  it("shows Route, Forecast, and Tides tab buttons", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    expect(screen.getByRole("button", { name: /^route$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^forecast$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^tides$/i })).toBeInTheDocument()
  })

  it("Route tab content is visible by default", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    expect(screen.getAllByTestId("route-waypoint").length).toBeGreaterThan(0)
  })

  it("switching to Forecast tab hides route waypoints", async () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    await userEvent.click(screen.getByRole("button", { name: /^forecast$/i }))
    expect(screen.queryAllByTestId("route-waypoint")).toHaveLength(0)
  })

  it("switching to Tides tab shows the tidal entry form", async () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    await userEvent.click(screen.getByRole("button", { name: /^tides$/i }))
    expect(screen.getByTestId("tidal-entry-form")).toBeInTheDocument()
    expect(screen.getByTestId("tidal-gate-warnings")).toBeInTheDocument()
  })
})

// ─── route tab ────────────────────────────────────────────────────────────────

describe("FeatureDrawer — Route tab", () => {
  it("lists waypoints for the selected day", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    expect(screen.getAllByTestId("route-waypoint")).toHaveLength(2)
  })

  it("shows the point name when available", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    expect(screen.getByText("Start")).toBeInTheDocument()
    expect(screen.getByText("End")).toBeInTheDocument()
  })

  it("lists stops only — mid-day positions are aggregated, not shown as rows", () => {
    renderWithCtx(
      makeCtx({
        selectedDayId: DAY1_ID,
        state: {
          // Launch (stop) → waypoint (position, pass-through) → camp (stop).
          points: [
            pt("p1", DAY1_ID, { name: "Launch", type: "stop" }),
            pt("p2", DAY1_ID, { name: "Waypoint", type: "position" }),
            pt("p3", DAY1_ID, { name: "Camp", type: "stop" }),
          ],
          pointOrder: ["p1", "p2", "p3"],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1)],
        },
      }),
    )
    expect(screen.getAllByTestId("route-waypoint")).toHaveLength(2)
    expect(screen.getByText("Launch")).toBeInTheDocument()
    expect(screen.getByText("Camp")).toBeInTheDocument()
    expect(screen.queryByText("Waypoint")).not.toBeInTheDocument()
    // The collapsed position is signalled by a toggle, not shown itself.
    expect(screen.getByRole("button", { name: /1 waypoint along the way/i })).toBeInTheDocument()
  })

  it("clicking a waypoint calls setSelectedPointId with its id", async () => {
    const setSelectedPointId = vi.fn()
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID, setSelectedPointId }))
    await userEvent.click(screen.getAllByTestId("route-waypoint")[0])
    expect(setSelectedPointId).toHaveBeenCalledWith("p1")
  })

  it("numbers waypoints by their absolute route position (matching the map markers), not per-day", () => {
    const DAY2_ID = "day-2"
    renderWithCtx(
      makeCtx({
        selectedDayId: DAY2_ID,
        state: {
          // p1,p2 → Day 1; p3,p4 → Day 2. Day 2's first point is #3 overall.
          points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY2_ID), pt("p4", DAY2_ID)],
          pointOrder: ["p1", "p2", "p3", "p4"],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1), day(DAY2_ID, 2)],
        },
      }),
    )
    expect(screen.getByText("Point 3")).toBeInTheDocument()
    expect(screen.getByText("Point 4")).toBeInTheDocument()
    expect(screen.queryByText("Point 1")).not.toBeInTheDocument()
  })

  it("shows empty state when there are no waypoints for the selected day", () => {
    renderWithCtx(
      makeCtx({
        selectedDayId: DAY1_ID,
        state: {
          points: [],
          pointOrder: [],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1)],
        },
      }),
    )
    expect(screen.getByText(/no waypoints/i)).toBeInTheDocument()
  })
})

// ─── route tab: waypoint accordion ───────────────────────────────────────────

describe("FeatureDrawer — waypoint accordion", () => {
  function launchWaypointCamp() {
    return makeCtx({
      selectedDayId: DAY1_ID,
      state: {
        points: [
          pt("p1", DAY1_ID, { name: "Launch", type: "stop" }),
          pt("p2", DAY1_ID, { name: "Waypoint", type: "position" }),
          pt("p3", DAY1_ID, { name: "Camp", type: "stop" }),
        ],
        pointOrder: ["p1", "p2", "p3"],
        pendingPointId: null,
        pendingPointName: null,
        savingCount: 0,
        days: [day(DAY1_ID, 1)],
      },
    })
  }

  it("does not render the position as a row until the toggle is opened", () => {
    renderWithCtx(launchWaypointCamp())
    expect(screen.queryByTestId("route-waypoint-via")).not.toBeInTheDocument()
  })

  it("reveals the position on toggle, expanded with its distance/time from the last stop", async () => {
    renderWithCtx(launchWaypointCamp())
    const toggle = screen.getByRole("button", { name: /1 waypoint along the way/i })
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute("aria-expanded", "true")
    const via = screen.getByTestId("route-waypoint-via")
    expect(via).toHaveTextContent("Waypoint")
    // avgSpeedKnots: 2.5 (fixture default); asserts against the real helper's output
    // (every fixture point sits at the same coordinates, so this is legLabel(0, ...))
    // rather than a hand-typed string that would drift if the fixture changed.
    expect(via).toHaveTextContent(legLabel(0, 2.5, "nm"))
  })

  it("falls back to the absolute route ordinal when the position has no name", async () => {
    const ctx = makeCtx({
      selectedDayId: DAY1_ID,
      state: {
        points: [
          pt("p1", DAY1_ID, { name: "Launch", type: "stop" }),
          pt("p2", DAY1_ID, { type: "position" }), // unnamed
          pt("p3", DAY1_ID, { name: "Camp", type: "stop" }),
        ],
        pointOrder: ["p1", "p2", "p3"],
        pendingPointId: null,
        pendingPointName: null,
        savingCount: 0,
        days: [day(DAY1_ID, 1)],
      },
    })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /1 waypoint along the way/i }))
    // "p2" is 2nd overall in pointOrder — matches the map's own marker numbering.
    expect(screen.getByTestId("route-waypoint-via")).toHaveTextContent("Point 2")
  })

  it("places the toggle before the stop it leads to, matching paddling order", async () => {
    // Launch -> Waypoint -> Camp: Waypoint is paddled *before* reaching Camp, so
    // the accordion revealing it must read between Launch and Camp, not after Camp.
    renderWithCtx(launchWaypointCamp())
    await userEvent.click(screen.getByRole("button", { name: /1 waypoint along the way/i }))

    const rowTexts = screen.getAllByText(/^(Launch|Waypoint|Camp)$/).map((el) => el.textContent)
    expect(rowTexts).toEqual(["Launch", "Waypoint", "Camp"])
  })

  it("collapses again on a second click of the toggle", async () => {
    renderWithCtx(launchWaypointCamp())
    const toggle = screen.getByRole("button", { name: /1 waypoint along the way/i })
    await userEvent.click(toggle)
    expect(screen.getByTestId("route-waypoint-via")).toBeInTheDocument()

    await userEvent.click(toggle)
    expect(screen.queryByTestId("route-waypoint-via")).not.toBeInTheDocument()
  })

  it("clicking a revealed position calls setSelectedPointId with its own id, not the stop's", async () => {
    const setSelectedPointId = vi.fn()
    renderWithCtx({ ...launchWaypointCamp(), setSelectedPointId })
    await userEvent.click(screen.getByRole("button", { name: /1 waypoint along the way/i }))
    await userEvent.click(screen.getByTestId("route-waypoint-via"))
    expect(setSelectedPointId).toHaveBeenCalledWith("p2")
  })

  it("names a named position instead of falling back to its ordinal", async () => {
    const ctx = makeCtx({
      selectedDayId: DAY1_ID,
      state: {
        points: [
          pt("p1", DAY1_ID, { name: "Launch", type: "stop" }),
          pt("p2", DAY1_ID, { name: "Rocky point", type: "position" }),
          pt("p3", DAY1_ID, { name: "Camp", type: "stop" }),
        ],
        pointOrder: ["p1", "p2", "p3"],
        pendingPointId: null,
        pendingPointName: null,
        savingCount: 0,
        days: [day(DAY1_ID, 1)],
      },
    })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /1 waypoint along the way/i }))
    expect(screen.getByTestId("route-waypoint-via")).toHaveTextContent("Rocky point")
  })

  it("does not render a toggle for two adjacent stops with nothing between them", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID })) // fixture default: p1, p2, both stops-by-position (first/last anchors)
    expect(screen.queryByTestId("route-waypoint-via-toggle")).not.toBeInTheDocument()
  })
})

// ─── forecast tab ─────────────────────────────────────────────────────────────────

describe("FeatureDrawer — Forecast tab", () => {
  it("shows empty state when no forecast is fetched", async () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    await userEvent.click(screen.getByRole("button", { name: /^forecast$/i }))
    expect(screen.getByText(/no forecast/i)).toBeInTheDocument()
  })

  it("shows fetch forecast button for a leader with no data", async () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID, isLeader: true }))
    await userEvent.click(screen.getByRole("button", { name: /^forecast$/i }))
    expect(screen.getByRole("button", { name: /fetch forecast/i })).toBeInTheDocument()
  })
})

// ─── forecast fetch (view-mode weather collection) ──────────────────────────────

describe("FeatureDrawer — Forecast fetch", () => {
  async function openForecast(ctx: MapBuilderContextValue) {
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /^forecast$/i }))
  }

  it("shows a 'Fetch forecast' button in the empty state for a leader", async () => {
    await openForecast(makeCtx({ selectedDayId: DAY1_ID, isLeader: true }))
    expect(screen.getByRole("button", { name: /fetch forecast/i })).toBeInTheDocument()
  })

  it("hides the fetch control for a non-leader", async () => {
    await openForecast(makeCtx({ selectedDayId: DAY1_ID, isLeader: false }))
    expect(screen.queryByRole("button", { name: /fetch forecast/i })).not.toBeInTheDocument()
  })

  it("hides the fetch control when the trip is in the past", async () => {
    await openForecast(makeCtx({ selectedDayId: DAY1_ID, isLeader: true, tripState: "past" }))
    expect(screen.queryByRole("button", { name: /fetch forecast/i })).not.toBeInTheDocument()
  })

  it("triggers a weather fetch when the button is clicked", async () => {
    const actions = await import("@/lib/weather/actions")
    await openForecast(makeCtx({ selectedDayId: DAY1_ID, isLeader: true }))
    await userEvent.click(screen.getByRole("button", { name: /fetch forecast/i }))
    expect(actions.triggerWeatherFetch).toHaveBeenCalledWith(DAY1_ID)
  })

  // useDayConditions().refresh() swallows a triggerWeatherFetch failure (returns
  // early with no error surfaced — see lib/weather/use-day-conditions.ts). The
  // drawer's own responsibility is at least not to get stuck: the button must
  // recover to its idle label and the empty state must not be corrupted.
  it("recovers to the idle Fetch forecast button when triggerWeatherFetch fails, instead of getting stuck", async () => {
    const actions = await import("@/lib/weather/actions")
    vi.mocked(actions.triggerWeatherFetch).mockResolvedValueOnce({
      success: false,
      error: "Failed to trigger weather fetch.",
    })
    await openForecast(makeCtx({ selectedDayId: DAY1_ID, isLeader: true }))

    await userEvent.click(screen.getByRole("button", { name: /fetch forecast/i }))

    expect(await screen.findByRole("button", { name: /^fetch forecast$/i })).toBeInTheDocument()
    expect(screen.getByText(/no forecast fetched for this day/i)).toBeInTheDocument()
  })
})
