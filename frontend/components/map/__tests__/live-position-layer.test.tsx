import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"
import type { LivePosition } from "@/lib/dtos/live-position"
import { palette } from "@/lib/tokens"

vi.mock("react-leaflet", () => ({
  CircleMarker: ({
    children,
    center,
    pathOptions,
  }: {
    children: React.ReactNode
    center: [number, number]
    pathOptions: { fillOpacity: number; fillColor: string; color: string }
  }) => (
    <div
      data-testid="circle-marker"
      data-center={center.join(",")}
      data-fill-opacity={pathOptions.fillOpacity}
      data-fill-color={pathOptions.fillColor}
      data-stroke-color={pathOptions.color}
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

  it("marks a live paddler in the live colour, not the destructive one", () => {
    // A paddler on the water is the most literally live thing in the app, and it used to
    // be drawn in red600 — the destructive role colour, the same hue as Abort expedition.
    // Asserted against the palette rather than a hex literal so a token change carries.
    render(<LivePositionLayer positions={[position()]} />)

    const marker = screen.getByTestId("circle-marker")
    expect(marker.dataset.fillColor).toBe(palette.foam400)
    expect(marker.dataset.fillColor).not.toBe(palette.red600)
  })

  it("rings the marker in ink so it separates by value, not by hue", () => {
    // The ring is what makes a foam fill legible on both pale water and beige coast.
    // Without it the fill would have to carry the contrast, which is the argument that
    // kept the marker red.
    render(<LivePositionLayer positions={[position()]} />)

    expect(screen.getByTestId("circle-marker").dataset.strokeColor).toBe(palette.ocean900)
  })

  it("renders nothing for an empty position list", () => {
    render(<LivePositionLayer positions={[]} />)
    expect(screen.queryByTestId("circle-marker")).not.toBeInTheDocument()
  })
})
