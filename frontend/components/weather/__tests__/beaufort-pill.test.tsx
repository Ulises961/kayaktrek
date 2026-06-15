import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { BeaufortPill } from "../beaufort-pill"

describe("BeaufortPill", () => {
  it("renders compass direction and knots when direction is given", () => {
    render(<BeaufortPill knots={12} direction={247} />)
    expect(screen.getByText("SW 12 kn")).toBeInTheDocument()
  })

  it("renders knots only when direction is absent", () => {
    render(<BeaufortPill knots={6} direction={null} />)
    expect(screen.getByText("6 kn")).toBeInTheDocument()
  })

  it("rounds the knots value", () => {
    render(<BeaufortPill knots={11.6} direction={0} />)
    expect(screen.getByText("N 12 kn")).toBeInTheDocument()
  })

  it("applies the calm colour class for light winds (B0-3)", () => {
    render(<BeaufortPill knots={3} direction={90} />)
    expect(screen.getByText("E 3 kn").className).toContain("text-green-700")
  })

  it("applies the gale colour class for B8+ winds", () => {
    render(<BeaufortPill knots={40} direction={90} />)
    expect(screen.getByText("E 40 kn").className).toContain("text-red-700")
  })
})
