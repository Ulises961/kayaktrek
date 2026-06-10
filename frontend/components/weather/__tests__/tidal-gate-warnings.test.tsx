import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TidalGateWarnings } from "../tidal-gate-warnings"
import type { TidalGateWarning } from "@/lib/dtos/tidal-station"

const blocking: TidalGateWarning = {
  pointId: "01900000-0000-7000-8000-000000000001",
  stationName: "Ramsey Sound",
  rateKnots: 5.4,
  directionDegrees: 200,
  nextSlackUtc: "2026-06-15T14:30:00Z",
  isBlocking: true,
}

const info: TidalGateWarning = {
  pointId: "01900000-0000-7000-8000-000000000002",
  stationName: "Jack Sound",
  rateKnots: 1.2,
  directionDegrees: null,
  nextSlackUtc: null,
  isBlocking: false,
}

describe("TidalGateWarnings", () => {
  it("renders nothing when there are no gates", () => {
    const { container } = render(<TidalGateWarnings gates={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("flags a blocking gate with the blocking style and rate", () => {
    render(<TidalGateWarnings gates={[blocking]} />)
    const item = screen.getByText("Ramsey Sound").closest("li")
    expect(item).toHaveAttribute("data-blocking", "true")
    expect(screen.getByText(/5\.4 kn/)).toBeInTheDocument()
    expect(screen.getByText(/next slack 14:30 UTC/)).toBeInTheDocument()
  })

  it("renders an informational gate without the blocking flag", () => {
    render(<TidalGateWarnings gates={[info]} />)
    const item = screen.getByText("Jack Sound").closest("li")
    expect(item).not.toHaveAttribute("data-blocking")
  })
})
