import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { LivePosition } from "@/lib/dtos/live-position"

const { useLivePositions } = vi.hoisted(() => ({ useLivePositions: vi.fn() }))
vi.mock("@/hooks/use-live-positions", () => ({ useLivePositions }))

const { MapLoader } = vi.hoisted(() => ({
  MapLoader: vi.fn(() => <div data-testid="map-loader" />),
}))
vi.mock("@/components/map/map-loader", () => ({ default: MapLoader }))

import { LiveStoryMap } from "../live-story-map"

function route(): RouteData {
  return {
    id: "route-1",
    name: "Aegean loop",
    positions: [
      [37, 25],
      [37.2, 25.3],
    ],
    days: [],
    boundaryColors: {},
    totalMiles: 20,
    dayCount: 3,
  }
}

function position(overrides: Partial<LivePosition> = {}): LivePosition {
  return {
    userId: "u1",
    name: "Ada",
    lat: 37,
    lon: 25,
    accuracyM: null,
    headingDeg: null,
    speedMs: null,
    recordedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("LiveStoryMap", () => {
  it("passes routes and live positions through to MapLoader", () => {
    const pos = position()
    const r = route()
    useLivePositions.mockReturnValue({ positions: [pos], status: "live" })

    render(<LiveStoryMap token="tok123" routes={[r]} />)

    expect(MapLoader).toHaveBeenCalledWith(
      expect.objectContaining({ routes: [r], livePositions: [pos] }),
      undefined,
    )
  })

  it("shows a 'LIVE · n paddlers' pill while live with at least one paddler", () => {
    useLivePositions.mockReturnValue({
      positions: [position({ userId: "u1" }), position({ userId: "u2" })],
      status: "live",
    })

    render(<LiveStoryMap token="tok123" routes={[route()]} />)

    expect(screen.getByText(/LIVE/)).toBeInTheDocument()
    expect(screen.getByText(/2 paddlers/)).toBeInTheDocument()
  })

  it("uses singular wording for exactly one paddler", () => {
    useLivePositions.mockReturnValue({ positions: [position()], status: "live" })

    render(<LiveStoryMap token="tok123" routes={[route()]} />)

    expect(screen.getByText(/1 paddler\b/)).toBeInTheDocument()
  })

  it("hides the pill before any positions have arrived", () => {
    useLivePositions.mockReturnValue({ positions: [], status: "connecting" })

    render(<LiveStoryMap token="tok123" routes={[route()]} />)

    expect(screen.queryByText(/LIVE/)).not.toBeInTheDocument()
  })

  it("connects to the sidecar story stream URL for the given token", () => {
    useLivePositions.mockReturnValue({ positions: [], status: "connecting" })

    render(<LiveStoryMap token="tok123" routes={[route()]} />)

    expect(useLivePositions).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/live/story/tok123/stream"),
    )
  })
})
