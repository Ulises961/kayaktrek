import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/trips/actions", () => ({ updateTrip: vi.fn() }))

import { updateTrip } from "@/lib/trips/actions"
import { ExtendTripRangeFooter } from "../extend-trip-range-footer"

beforeEach(() => vi.clearAllMocks())

describe("ExtendTripRangeFooter", () => {
  it("offers to push dateTo forward a week when direction is max", () => {
    render(<ExtendTripRangeFooter tripId="trip-1" direction="max" currentBound="2026-08-13" />)
    expect(screen.getByText(/need a later date/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /extend trip to 20 aug 2026/i })).toBeInTheDocument()
  })

  it("offers to push dateFrom back a week when direction is min", () => {
    render(<ExtendTripRangeFooter tripId="trip-1" direction="min" currentBound="2026-08-13" />)
    expect(screen.getByText(/need an earlier date/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /extend trip to 6 aug 2026/i })).toBeInTheDocument()
  })

  it("extends dateTo on click when direction is max", async () => {
    vi.mocked(updateTrip).mockResolvedValue({ success: true })
    render(<ExtendTripRangeFooter tripId="trip-1" direction="max" currentBound="2026-08-13" />)
    await userEvent.click(screen.getByRole("button", { name: /extend trip/i }))
    await waitFor(() => expect(updateTrip).toHaveBeenCalledWith("trip-1", { dateTo: "2026-08-20" }))
  })

  it("extends dateFrom on click when direction is min", async () => {
    vi.mocked(updateTrip).mockResolvedValue({ success: true })
    render(<ExtendTripRangeFooter tripId="trip-1" direction="min" currentBound="2026-08-13" />)
    await userEvent.click(screen.getByRole("button", { name: /extend trip/i }))
    await waitFor(() =>
      expect(updateTrip).toHaveBeenCalledWith("trip-1", { dateFrom: "2026-08-06" }),
    )
  })
})
