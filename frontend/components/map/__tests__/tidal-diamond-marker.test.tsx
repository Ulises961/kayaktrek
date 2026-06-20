import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"

vi.mock("leaflet", () => ({
  default: { divIcon: (opts: unknown) => ({ opts }) },
}))

// Capture the last Marker props so tests can assert draggability and fire the
// dragend handler that the real Leaflet marker would emit.
let lastMarkerProps: {
  draggable?: boolean
  eventHandlers?: { dragend?: (e: unknown) => void }
} = {}

vi.mock("react-leaflet", () => ({
  Marker: (props: {
    children?: React.ReactNode
    draggable?: boolean
    eventHandlers?: { dragend?: (e: unknown) => void }
  }) => {
    lastMarkerProps = props
    return (
      <div data-testid="diamond-marker" data-draggable={props.draggable ? "true" : "false"}>
        {props.children}
      </div>
    )
  },
  Circle: ({ radius }: { radius: number }) => (
    <div data-testid="diamond-radius" data-radius={radius} />
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="diamond-popup">{children}</div>
  ),
}))

import { TidalDiamondMarker, diamondColor, diamondIconHtml } from "../tidal-diamond-marker"
import type { TidalDiamond } from "@/lib/dtos/tidal-station"

const DIAMOND: TidalDiamond = {
  id: "01952f1a-0000-7000-8000-000000000020",
  name: "Race off the point",
  lat: 50.3,
  lng: -4.1,
  directionDegrees: 225,
  rateKnots: 1.8,
  source: "simple",
  radiusM: 500,
  isUserCreated: true,
  hourlyTable: [
    { hourFromHw: -1, rateKnots: 1.0, directionDegrees: 45 },
    { hourFromHw: 0, rateKnots: 1.0, directionDegrees: 225 },
    { hourFromHw: 3, rateKnots: 3.0, directionDegrees: 225 },
  ],
}

describe("diamondColor", () => {
  it("ramps green → yellow → orange → red by rate", () => {
    expect(diamondColor(0.5)).toBe("#16a34a")
    expect(diamondColor(1.5)).toBe("#eab308")
    expect(diamondColor(2.5)).toBe("#f97316")
    expect(diamondColor(4)).toBe("#dc2626")
  })

  it("uses a neutral colour when the rate is unknown", () => {
    expect(diamondColor(null)).toBe("#94a3b8")
  })
})

describe("diamondIconHtml", () => {
  it("rotates the arrow to the set direction", () => {
    expect(diamondIconHtml(1.8, 225, "#eab308")).toContain("rotate(225deg)")
  })

  it("renders the rate label in knots", () => {
    expect(diamondIconHtml(1.8, 225, "#eab308")).toContain("1.8")
  })

  it("omits the direction arrow when direction is unknown", () => {
    // The ◇ body always carries rotate(45deg); only the arrow triangle is conditional.
    expect(diamondIconHtml(1.8, 225, "#eab308")).toContain("border-bottom:11px")
    expect(diamondIconHtml(1.8, null, "#eab308")).not.toContain("border-bottom:11px")
  })
})

describe("TidalDiamondMarker", () => {
  it("renders a radius circle sized from radiusM", () => {
    render(<TidalDiamondMarker diamond={DIAMOND} />)
    expect(screen.getByTestId("diamond-radius")).toHaveAttribute("data-radius", "500")
  })

  it("falls back to the default radius when radiusM is absent", () => {
    render(<TidalDiamondMarker diamond={{ ...DIAMOND, radiusM: null }} />)
    expect(screen.getByTestId("diamond-radius")).toHaveAttribute("data-radius", "500")
  })

  it("shows the diamond name and an hour-by-hour table in the popup", () => {
    render(<TidalDiamondMarker diamond={DIAMOND} />)
    expect(screen.getByText("Race off the point")).toBeInTheDocument()
    // One row per hourly entry, keyed by hours-from-HW.
    expect(screen.getByText("+3")).toBeInTheDocument()
    expect(screen.getByText("-1")).toBeInTheDocument()
  })

  it("is read-only by default: not draggable and no delete control", () => {
    render(<TidalDiamondMarker diamond={DIAMOND} />)
    expect(screen.getByTestId("diamond-marker")).toHaveAttribute("data-draggable", "false")
    expect(screen.queryByText(/delete diamond/i)).not.toBeInTheDocument()
  })

  it("is draggable and reports the new position on dragend when editable", () => {
    const onDragEnd = vi.fn()
    render(<TidalDiamondMarker diamond={DIAMOND} editable onDragEnd={onDragEnd} />)
    expect(screen.getByTestId("diamond-marker")).toHaveAttribute("data-draggable", "true")

    lastMarkerProps.eventHandlers?.dragend?.({
      target: { getLatLng: () => ({ lat: 51, lng: -3 }) },
    })
    expect(onDragEnd).toHaveBeenCalledWith(51, -3)
  })

  it("renders a delete control that calls onDelete when editable", async () => {
    const onDelete = vi.fn()
    render(<TidalDiamondMarker diamond={DIAMOND} editable onDelete={onDelete} />)
    await userEvent.click(screen.getByRole("button", { name: /delete diamond/i }))
    expect(onDelete).toHaveBeenCalled()
  })
})
