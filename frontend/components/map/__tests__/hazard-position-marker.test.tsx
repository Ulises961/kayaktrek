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
}))

import { HazardPositionMarker } from "../hazard-position-marker"
import type { HazardDiamondPosition } from "@/lib/dtos/hazard-diamond"

const POSITION: HazardDiamondPosition = {
  id: "01952f1a-0000-7000-8000-000000000060",
  lat: 50.3,
  lng: -4.1,
  kind: "wind",
}

describe("HazardPositionMarker", () => {
  it("never shows a name, notes, or any content — only the privacy notice", () => {
    render(<HazardPositionMarker position={POSITION} />)
    expect(
      screen.getByText(/a hazard marker exists here.*details are private to another trip/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/verify independently/i)).toBeInTheDocument()
  })

  it("never renders an edit or delete affordance", () => {
    render(<HazardPositionMarker position={POSITION} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
