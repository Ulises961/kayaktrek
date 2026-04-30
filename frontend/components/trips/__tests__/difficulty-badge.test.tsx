import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DifficultyBadge } from "../difficulty-badge"
import type { TripDifficulty } from "@/lib/dtos/trip"

describe("DifficultyBadge", () => {
  it.each(["easy", "moderate", "demanding", "expert"] as TripDifficulty[])(
    "renders the %s label",
    (difficulty) => {
      render(<DifficultyBadge difficulty={difficulty} />)
      expect(screen.getByText(difficulty, { exact: false })).toBeTruthy()
    }
  )

  it("renders nothing when difficulty is null", () => {
    const { container } = render(<DifficultyBadge difficulty={null} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders nothing when difficulty is undefined", () => {
    const { container } = render(<DifficultyBadge difficulty={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})
