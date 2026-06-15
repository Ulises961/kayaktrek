import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RuleOfTwelfthsTable } from "../rule-of-twelfths-table"
import type { RuleOfTwelfthsEntry } from "@/lib/dtos/sea"

const ENTRIES: RuleOfTwelfthsEntry[] = [
  { hourFromLw: 0, cumulativeFraction: 0, estimatedHeightM: 0 },
  { hourFromLw: 1, cumulativeFraction: 1 / 12, estimatedHeightM: 0.42 },
  { hourFromLw: 6, cumulativeFraction: 1, estimatedHeightM: 5.0 },
]

describe("RuleOfTwelfthsTable", () => {
  it("renders a row per entry with cumulative fraction and height", () => {
    render(<RuleOfTwelfthsTable entries={ENTRIES} />)
    expect(screen.getByText("+6 h")).toBeInTheDocument()
    expect(screen.getByText("8%")).toBeInTheDocument() // 1/12 → 8%
    expect(screen.getByText("5.00 m")).toBeInTheDocument()
  })

  it("renders nothing when there are no entries", () => {
    const { container } = render(<RuleOfTwelfthsTable entries={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
