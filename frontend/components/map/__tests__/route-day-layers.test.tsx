import { describe, it, expect, vi, beforeEach } from "vitest"
import { render } from "@testing-library/react"
import React from "react"
import type { RouteData, RouteDaySegment } from "@/lib/itinerary/public-routes"

const { ringIcon } = vi.hoisted(() => ({
  ringIcon: vi.fn(() => ({ __mockIcon: true })),
}))

vi.mock("@/components/map/ring-icon", () => ({ ringIcon }))

vi.mock("react-leaflet", () => ({
  Polyline: vi.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>),
  Marker: vi.fn(({ children }: { children?: React.ReactNode }) => <>{children}</>),
  Popup: ({ children }: { children: React.ReactNode }) => <div data-testid="popup">{children}</div>,
}))

import { Polyline, Marker } from "react-leaflet"
import { RouteDayLayers } from "../route-day-layers"

function daySegment(overrides: Partial<RouteDaySegment> = {}): RouteDaySegment {
  return {
    dayNumber: 1,
    date: "2026-07-01",
    color: "#2272b6",
    distanceNm: 1.2,
    points: [
      { lat: 41.9, lon: 12.4, type: "position", name: null, images: [], pointNumber: 1 },
      { lat: 42.0, lon: 12.5, type: "stop", name: "Cove", images: [], pointNumber: 2 },
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

describe("RouteDayLayers", () => {
  it("draws one polyline per day, coloured via the segment's own color", () => {
    render(<RouteDayLayers routes={[route()]} />)
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
      <RouteDayLayers
        routes={[
          route({
            days: [
              daySegment({
                points: [
                  {
                    lat: 41.9,
                    lon: 12.4,
                    type: "position",
                    name: null,
                    images: [],
                    pointNumber: 1,
                  },
                ],
              }),
            ],
          }),
        ]}
      />,
    )
    expect(vi.mocked(Polyline).mock.calls).toHaveLength(0)
  })

  it("renders a ring-icon marker per point, passing through each point's own number (both types numbered)", () => {
    render(<RouteDayLayers routes={[route()]} />)
    expect(ringIcon).toHaveBeenCalledWith("#2272b6", "position", 1)
    expect(ringIcon).toHaveBeenCalledWith("#2272b6", "stop", 2)
    expect(vi.mocked(Marker).mock.calls).toHaveLength(2)
  })

  it("does not recompute or reset numbering across day segments — it just renders point.pointNumber", () => {
    render(
      <RouteDayLayers
        routes={[
          route({
            days: [
              daySegment({
                dayNumber: 1,
                points: [
                  { lat: 41.9, lon: 12.4, type: "stop", name: null, images: [], pointNumber: 1 },
                ],
              }),
              daySegment({
                dayNumber: 2,
                points: [
                  { lat: 42.0, lon: 12.5, type: "stop", name: null, images: [], pointNumber: 2 },
                ],
              }),
            ],
          }),
        ]}
      />,
    )
    expect(ringIcon).toHaveBeenCalledWith("#2272b6", "stop", 1)
    expect(ringIcon).toHaveBeenCalledWith("#2272b6", "stop", 2)
  })

  it("shows opted-in photos in the point's popup by default", () => {
    const { getAllByTestId } = render(
      <RouteDayLayers
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
                    pointNumber: 1,
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

  it("suppresses photos when showPhotos is false, keeping the point name", () => {
    const { getAllByTestId } = render(
      <RouteDayLayers
        showPhotos={false}
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
                    pointNumber: 1,
                  },
                ],
              }),
            ],
          }),
        ]}
      />,
    )
    const popups = getAllByTestId("popup")
    expect(popups[0].querySelector("img")).toBeNull()
    expect(popups[0].textContent).toContain("Cove")
  })

  it("renders no marker popup for a point with no name and photos suppressed", () => {
    const { getAllByTestId } = render(
      <RouteDayLayers
        showPhotos={false}
        routes={[
          route({
            days: [
              daySegment({
                points: [
                  {
                    lat: 41.9,
                    lon: 12.4,
                    type: "position",
                    name: null,
                    images: [{ url: "https://example.com/a.jpg" }],
                    pointNumber: 1,
                  },
                  { lat: 42.0, lon: 12.5, type: "stop", name: null, images: [], pointNumber: 2 },
                ],
              }),
            ],
          }),
        ]}
      />,
    )
    // The day segment's own polyline popup (route name + day label) still renders —
    // only the per-point marker popups are suppressed when there's nothing to show.
    const popups = getAllByTestId("popup")
    expect(popups).toHaveLength(1)
    expect(popups[0].textContent).toContain("Day 1")
  })
})
