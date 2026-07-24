import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"
import type { LivePosition } from "@/lib/dtos/live-position"

vi.mock("react-leaflet", () => ({
  CircleMarker: ({
    children,
    center,
    pathOptions,
  }: {
    children: React.ReactNode
    center: [number, number]
    pathOptions: { fillOpacity: number }
  }) => (
    <div
      data-testid="circle-marker"
      data-center={center.join(",")}
      data-fill-opacity={pathOptions.fillOpacity}
    >
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip">{children}</div>
  ),
}))

import { LivePositionLayer } from "../live-position-layer"

function position(overrides: Partial<LivePosition> = {}): LivePosition {
  return {
    userId: "u1",
    name: "Paddler One",
    lat: 43.1,
    lon: 13.2,
    accuracyM: null,
    headingDeg: null,
    speedMs: null,
    recordedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("LivePositionLayer", () => {
  it("renders one marker per position, positioned by lat/lon", () => {
    render(
      <LivePositionLayer
        positions={[
          position({ userId: "u1", lat: 43.1, lon: 13.2 }),
          position({ userId: "u2", lat: 44.0, lon: 14.0 }),
        ]}
      />,
    )
    const markers = screen.getAllByTestId("circle-marker")
    expect(markers).toHaveLength(2)
    expect(markers[0]).toHaveAttribute("data-center", "43.1,13.2")
    expect(markers[1]).toHaveAttribute("data-center", "44,14")
  })

  it("shows the paddler's name and a relative time in the tooltip", () => {
    const now = new Date("2026-07-20T10:10:00Z")
    render(
      <LivePositionLayer
        positions={[position({ name: "Ada", recordedAt: "2026-07-20T10:05:00Z" })]}
        now={now}
      />,
    )
    expect(screen.getByTestId("tooltip").textContent).toContain("Ada")
    expect(screen.getByTestId("tooltip").textContent).toContain("5 min ago")
  })

  it("fades a position older than 10 minutes", () => {
    const now = new Date("2026-07-20T10:20:00Z")
    render(
      <LivePositionLayer
        positions={[position({ recordedAt: "2026-07-20T10:00:00Z" })]}
        now={now}
      />,
    )
    const marker = screen.getByTestId("circle-marker")
    expect(Number(marker.dataset.fillOpacity)).toBeLessThan(0.5)
  })

  it("does not fade a fresh position", () => {
    const now = new Date("2026-07-20T10:02:00Z")
    render(
      <LivePositionLayer
        positions={[position({ recordedAt: "2026-07-20T10:00:00Z" })]}
        now={now}
      />,
    )
    const marker = screen.getByTestId("circle-marker")
    expect(Number(marker.dataset.fillOpacity)).toBeGreaterThan(0.5)
  })

  it("renders nothing for an empty position list", () => {
    render(<LivePositionLayer positions={[]} />)
    expect(screen.queryByTestId("circle-marker")).not.toBeInTheDocument()
  })
})
