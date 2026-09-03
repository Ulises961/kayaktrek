import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouteDayBreakdown } from "../route-day-breakdown"
import { DISTANCE_UNIT, formatDistance, legLabel } from "@/lib/itinerary/distance"
import { POINT_TYPE } from "@/lib/dtos/point"
import type { RouteDaySegment, RoutePoint } from "@/lib/itinerary/public-routes"

function point(id: string, lat: number, lon: number, extra: Partial<RoutePoint> = {}): RoutePoint {
  return {
    id,
    lat,
    lon,
    type: POINT_TYPE.POSITION,
    name: null,
    images: [],
    pointNumber: null,
    ...extra,
  }
}

function daySeg(
  dayNumber: number,
  date: string | null,
  distanceNm: number,
  points: RoutePoint[] = [],
): RouteDaySegment {
  return { dayNumber, date, color: "#123456", points, distanceNm }
}

const DAYS: RouteDaySegment[] = [daySeg(1, "2026-07-01", 12.34), daySeg(2, null, 8)]

describe("RouteDayBreakdown", () => {
  it("renders a row per day with distance in nm by default", () => {
    render(<RouteDayBreakdown days={DAYS} />)
    expect(screen.getByText("Day 1")).toBeInTheDocument()
    expect(screen.getByText("Day 2")).toBeInTheDocument()
    expect(screen.getByText("12.3 nm")).toBeInTheDocument()
    expect(screen.getByText("8.0 nm")).toBeInTheDocument()
  })

  it("converts each day's distance to km when unit is km", () => {
    render(<RouteDayBreakdown days={DAYS} unit={DISTANCE_UNIT.KM} />)
    expect(screen.getByText(`${formatDistance(12.34, DISTANCE_UNIT.KM)} km`)).toBeInTheDocument()
    expect(screen.getByText(`${formatDistance(8, DISTANCE_UNIT.KM)} km`)).toBeInTheDocument()
    expect(screen.queryByText(/nm/)).not.toBeInTheDocument()
  })

  it("shows a day's date when present and omits it when absent", () => {
    render(<RouteDayBreakdown days={DAYS} />)
    expect(screen.getByText("1 Jul 2026")).toBeInTheDocument()
  })

  it("renders nothing when there are no days", () => {
    const { container } = render(<RouteDayBreakdown days={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("does not render a stop list for a single-point day — nothing to break down", () => {
    render(<RouteDayBreakdown days={[daySeg(1, null, 0, [point("a", 44, 8.5)])]} />)
    expect(screen.queryByTestId("day-breakdown-via-toggle")).not.toBeInTheDocument()
  })
})

describe("RouteDayBreakdown — stop list", () => {
  it("lists two adjacent stops by name, with no waypoint toggle between them", () => {
    const day = daySeg(1, null, 30, [
      point("a", 0, 0, { type: POINT_TYPE.STOP, name: "Launch", pointNumber: 1 }),
      point("b", 0.5, 0, { type: POINT_TYPE.STOP, name: "Camp", pointNumber: 2 }),
    ])
    render(<RouteDayBreakdown days={[day]} />)
    expect(screen.getByText("Launch")).toBeInTheDocument()
    expect(screen.getByText("Camp")).toBeInTheDocument()
    expect(screen.queryByTestId("day-breakdown-via-toggle")).not.toBeInTheDocument()
  })

  it("hides an intervening position until its toggle is opened", () => {
    const day = daySeg(1, null, 30, [
      point("a", 0, 0, { type: POINT_TYPE.STOP, name: "Launch" }),
      point("b", 0.25, 0, { type: POINT_TYPE.POSITION, name: "Rocky point" }),
      point("c", 0.5, 0, { type: POINT_TYPE.STOP, name: "Camp" }),
    ])
    render(<RouteDayBreakdown days={[day]} />)
    expect(screen.queryByText("Rocky point")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /1 waypoint along the way/i })).toBeInTheDocument()
  })

  it("reveals the position's name and distance/time from the last stop on toggle", async () => {
    const day = daySeg(1, null, 30, [
      point("a", 0, 0, { type: POINT_TYPE.STOP, name: "Launch" }),
      point("b", 0.25, 0, { type: POINT_TYPE.POSITION, name: "Rocky point" }),
      point("c", 0.5, 0, { type: POINT_TYPE.STOP, name: "Camp" }),
    ])
    render(<RouteDayBreakdown days={[day]} avgSpeedKnots={2.5} />)
    await userEvent.click(screen.getByRole("button", { name: /1 waypoint along the way/i }))

    const via = screen.getByTestId("day-breakdown-via")
    expect(via).toHaveTextContent("Rocky point")
    // ~0.25° latitude ≈ 15 nm at this longitude — asserts against the real helper's
    // output rather than a hand-typed figure that would drift with the fixture.
    expect(via).toHaveTextContent(legLabel(15, 2.5, DISTANCE_UNIT.NM))
  })

  it("falls back to the point's ordinal number when a position has no name", async () => {
    const day = daySeg(1, null, 30, [
      point("a", 0, 0, { type: POINT_TYPE.STOP, name: "Launch" }),
      point("b", 0.25, 0, { type: POINT_TYPE.POSITION, pointNumber: 7 }), // unnamed
      point("c", 0.5, 0, { type: POINT_TYPE.STOP, name: "Camp" }),
    ])
    render(<RouteDayBreakdown days={[day]} />)
    await userEvent.click(screen.getByRole("button", { name: /1 waypoint along the way/i }))
    expect(screen.getByTestId("day-breakdown-via")).toHaveTextContent("Point 7")
  })

  it("shows distance only, no time, when the route has no planning speed set", async () => {
    const day = daySeg(1, null, 30, [
      point("a", 0, 0, { type: POINT_TYPE.STOP, name: "Launch" }),
      point("b", 0.25, 0, { type: POINT_TYPE.POSITION, name: "Rocky point" }),
      point("c", 0.5, 0, { type: POINT_TYPE.STOP, name: "Camp" }),
    ])
    render(<RouteDayBreakdown days={[day]} />)
    await userEvent.click(screen.getByRole("button", { name: /1 waypoint along the way/i }))
    const via = screen.getByTestId("day-breakdown-via")
    expect(via).toHaveTextContent(`${formatDistance(15, DISTANCE_UNIT.NM)} nm`)
    expect(via).not.toHaveTextContent(/min|h /)
  })

  it("places the toggle before the stop it leads to, matching paddling order", async () => {
    // 1 -> 2 -> 3 -> 4: 2 and 3 are waypoints paddled *before* reaching 4, so the
    // accordion revealing them must read between 1 and 4, not after 4.
    const day = daySeg(1, null, 30, [
      point("p1", 0, 0, { type: POINT_TYPE.STOP, name: "Launch", pointNumber: 1 }),
      point("p2", 0.2, 0, { type: POINT_TYPE.POSITION, pointNumber: 2 }),
      point("p3", 0.4, 0, { type: POINT_TYPE.POSITION, pointNumber: 3 }),
      point("p4", 0.6, 0, { type: POINT_TYPE.STOP, name: "Camp", pointNumber: 4 }),
    ])
    render(<RouteDayBreakdown days={[day]} />)
    await userEvent.click(screen.getByRole("button", { name: /2 waypoints along the way/i }))

    const rowTexts = screen
      .getAllByText(/^(Launch|Point 2|Point 3|Camp)$/)
      .map((el) => el.textContent)
    expect(rowTexts).toEqual(["Launch", "Point 2", "Point 3", "Camp"])
  })

  it("collapses again on a second click of the toggle", async () => {
    const day = daySeg(1, null, 30, [
      point("a", 0, 0, { type: POINT_TYPE.STOP, name: "Launch" }),
      point("b", 0.25, 0, { type: POINT_TYPE.POSITION, name: "Rocky point" }),
      point("c", 0.5, 0, { type: POINT_TYPE.STOP, name: "Camp" }),
    ])
    render(<RouteDayBreakdown days={[day]} />)
    const toggle = screen.getByRole("button", { name: /1 waypoint along the way/i })
    await userEvent.click(toggle)
    expect(screen.getByTestId("day-breakdown-via")).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(screen.queryByTestId("day-breakdown-via")).not.toBeInTheDocument()
  })
})
