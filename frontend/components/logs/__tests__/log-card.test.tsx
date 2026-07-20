import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logs/actions", () => ({
  createLog: vi.fn(),
  updateLog: vi.fn(),
  deleteLog: vi.fn(),
}))

import { LogCard } from "../log-card"
import { formatDayDate } from "@/lib/utils/date"
import { DISTANCE_UNIT, toNm } from "@/lib/itinerary/distance"
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
  it("renders the date formatted, not as a raw ISO string", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText(formatDayDate(FULL_LOG.date))).toBeTruthy()
    expect(screen.queryByText("2026-07-03")).not.toBeInTheDocument()
  })

  it("renders hours", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText(/6.5/)).toBeTruthy()
  })

  it("renders distance", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText(/22.4/)).toBeTruthy()
  })

  it("shows distance in km by default, stored value unchanged", () => {
    render(<LogCard log={FULL_LOG} />)
    expect(screen.getByText("22.4 km")).toBeInTheDocument()
  })

  it("converts the stored km distance to nm when unit is nm", () => {
    render(<LogCard log={FULL_LOG} unit={DISTANCE_UNIT.NM} />)
    expect(screen.getByText(`${toNm(FULL_LOG.distance!).toFixed(1)} nm`)).toBeInTheDocument()
    expect(screen.queryByText(/22\.4 km/)).not.toBeInTheDocument()
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

  it("shows an edit affordance on the owner variant that opens the edit dialog", async () => {
    render(<LogCard log={FULL_LOG} />)
    await userEvent.click(screen.getByRole("button", { name: /edit log/i }))
    expect(screen.getByRole("dialog", { name: /edit log/i })).toBeInTheDocument()
  })

  it("shows a delete affordance on the owner variant that opens a confirm dialog", async () => {
    render(<LogCard log={FULL_LOG} />)
    await userEvent.click(screen.getByRole("button", { name: /delete log/i }))
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  })

  it("shows a withdraw affordance and no edit/delete affordance on the endorsed variant", () => {
    render(<LogCard log={FULL_LOG} variant="endorsed" />)
    expect(screen.getByRole("button", { name: /endorsed/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /edit log/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /delete log/i })).toBeNull()
  })
})
