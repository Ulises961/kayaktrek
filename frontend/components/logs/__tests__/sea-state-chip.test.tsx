import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SeaStateChip } from "../sea-state-chip"

describe("SeaStateChip", () => {
  it("renders nothing when value is null", () => {
    const { container } = render(<SeaStateChip value={null} />)
    expect(container.firstChild).toBeNull()
  })

  it.each([
    [0, "Calm"],
    [1, "Calm"],
    [2, "Light"],
    [3, "Light"],
    [4, "Moderate"],
    [5, "Moderate"],
    [6, "Rough"],
    [8, "Rough"],
    [9, "Storm"],
    [12, "Storm"],
  ])("Beaufort %i renders label %s", (value, label) => {
    render(<SeaStateChip value={value} />)
    expect(screen.getByText(new RegExp(label, "i"))).toBeTruthy()
  })

  it("shows the numeric value", () => {
    render(<SeaStateChip value={5} />)
    expect(screen.getByText(/5/)).toBeTruthy()
  })
})
