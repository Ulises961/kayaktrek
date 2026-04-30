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
})
