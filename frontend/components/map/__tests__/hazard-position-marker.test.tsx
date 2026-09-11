import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("leaflet", () => ({
  default: { divIcon: (opts: unknown) => ({ opts }) },
}))

vi.mock("react-leaflet", () => ({
  Marker: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="hazard-position-marker">{children}</div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="hazard-position-popup">{children}</div>
  ),
  Circle: (props: { radius: number; pathOptions?: { color?: string } }) => (
    <div
      data-testid="hazard-position-halo"
      data-radius={props.radius}
      data-color={props.pathOptions?.color}
    />
  ),
}))

import {
  HazardPositionMarker,
  hazardPositionIconHtml,
  HAZARD_HALO_RADIUS_M,
} from "../hazard-position-marker"
import type { HazardDiamondPosition } from "@/lib/dtos/hazard-diamond"

const WIND_POSITION: HazardDiamondPosition = {
  id: "01952f1a-0000-7000-8000-000000000060",
  lat: 50.3,
  lng: -4.1,
  kind: "wind",
}

const TIDAL_POSITION: HazardDiamondPosition = { ...WIND_POSITION, kind: "tidal" }

describe("HazardPositionMarker", () => {
  it("names the hazard type — wind — but never a name, notes, or any other content", () => {
    render(<HazardPositionMarker position={WIND_POSITION} />)
    expect(screen.getByText(/^wind hazard — unverified$/i)).toBeInTheDocument()
    expect(
      screen.getByText(/a paddler flagged the area for possible katabatic winds/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/exercise caution and verify independently/i)).toBeInTheDocument()
  })

  it("names the hazard type — tidal — but never a name, notes, or any other content", () => {
    render(<HazardPositionMarker position={TIDAL_POSITION} />)
    expect(screen.getByText(/^tidal race hazard — unverified$/i)).toBeInTheDocument()
    expect(
      screen.getByText(/a paddler flagged the area for possible tidal races/i),
    ).toBeInTheDocument()
  })

  it("never renders an edit or delete affordance", () => {
    render(<HazardPositionMarker position={WIND_POSITION} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("draws a fixed-radius, non-interactive halo around the pin to signal an approximate area, not a point", () => {
    render(<HazardPositionMarker position={WIND_POSITION} />)
    const halo = screen.getByTestId("hazard-position-halo")
    expect(halo).toHaveAttribute("data-radius", String(HAZARD_HALO_RADIUS_M))
  })

  it("colours the wind halo with the notice border and the tidal halo with the no-rate-data slate", () => {
    const { rerender } = render(<HazardPositionMarker position={WIND_POSITION} />)
    expect(screen.getByTestId("hazard-position-halo")).toHaveAttribute(
      "data-color",
      "var(--notice-border)",
    )

    rerender(<HazardPositionMarker position={TIDAL_POSITION} />)
    expect(screen.getByTestId("hazard-position-halo")).toHaveAttribute("data-color", "#94a3b8")
  })
})

describe("hazardPositionIconHtml", () => {
  it("gives the wind kind the wind glyph and the same notice colour as an owned wind diamond", () => {
    expect(hazardPositionIconHtml("wind")).toContain("<svg")
    expect(hazardPositionIconHtml("wind")).not.toContain("border-bottom")
    expect(hazardPositionIconHtml("wind")).toContain("var(--notice-bg)")
    expect(hazardPositionIconHtml("wind")).toContain("var(--notice-border)")
  })

  it("gives the tidal kind a plain diamond, no wind glyph, in the no-rate-data slate", () => {
    expect(hazardPositionIconHtml("tidal")).not.toContain("<svg")
    expect(hazardPositionIconHtml("tidal")).toContain("#94a3b8")
  })
})
