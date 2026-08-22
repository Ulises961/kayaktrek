import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DifficultyBadge } from "../difficulty-badge"
import { DIFFICULTIES, DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"

describe("DifficultyBadge", () => {
  // Driven by the constant and asserted against the real label map, so renaming a
  // grade or relabelling one needs no edits here. The previous version hardcoded the
  // four values and matched non-exactly, which passed on the raw value ("easy") and
  // so never actually asserted the label mapping it was named for.
  it.each(DIFFICULTIES)("renders the %s label", (difficulty) => {
    render(<DifficultyBadge difficulty={difficulty} />)
    expect(screen.getByText(DIFFICULTY_LABELS[difficulty])).toBeInTheDocument()
  })

  it("renders nothing when difficulty is null", () => {
    const { container } = render(<DifficultyBadge difficulty={null} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders nothing when difficulty is undefined", () => {
    const { container } = render(<DifficultyBadge difficulty={undefined} />)
    expect(container.firstChild).toBeNull()
  })
})
