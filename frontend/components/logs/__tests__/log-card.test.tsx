import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { LogCard } from "../log-card"
import type { Log } from "@/lib/dtos/log"

const FULL_LOG: Log = {
  id: "01952f1a-0000-7000-8000-000000000020",
  userId: "01952f1a-0000-7000-8000-000000000001",
  date: "2026-07-03",
  hours: 6.5,
  avgSea: 3,
  distance: 22.4,
  notes: "Good conditions.",
}

describe("LogCard", () => {
  it("renders the date", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText(/2026-07-03/)).toBeTruthy()
  })

  it("renders hours", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText(/6.5/)).toBeTruthy()
  })

  it("renders distance", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText(/22.4/)).toBeTruthy()
  })

  it("renders a sea state chip when avgSea is set", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText(/B3/i)).toBeTruthy()
  })

  it("renders gracefully with only an id", () => {
    render(<LogCard log={{ id: FULL_LOG.id }} />)
    expect(screen.getByText(/no date/i)).toBeTruthy()
  })

  it("shows the endorsement count and endorser avatars when present", () => {
    render(
      <LogCard
        log={{
          ...FULL_LOG,
          endorsementCount: 2,
          endorsers: [
            { id: "01952f1a-0000-7000-8000-000000000002", username: "sam", name: "Sam" },
            { id: "01952f1a-0000-7000-8000-000000000003", username: "ola", name: "Ola" },
          ],
        }}
      />,
    )
    expect(screen.getByText(/2 endorsements/i)).toBeTruthy()
  })

  it("uses singular wording for a single endorsement", () => {
    render(<LogCard log={{ ...FULL_LOG, endorsementCount: 1, endorsers: [] }} />)
    expect(screen.getByText(/1 endorsement\b/i)).toBeTruthy()
  })

  it("shows an edit link on the owner variant", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByRole("link", { name: /edit log/i })).toBeTruthy()
  })

  it("shows a withdraw affordance and no edit link on the endorsed variant", () => {
    render(<LogCard log={FULL_LOG} variant="endorsed" />)
    expect(screen.getByRole("button", { name: /endorsed/i })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /edit log/i })).toBeNull()
  })
})
