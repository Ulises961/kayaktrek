import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { TripCard } from "../trip-card"
import type { Trip } from "@/lib/dtos/trip"
import { formatDateRange } from "@/lib/trips/format"

const BASE_TRIP: Trip = {
  id: "01952f1a-0000-7000-8000-000000000010",
  state: "building",
  destination: "Costa Brava",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-05",
  travellers: [
    {
      id: "01952f1a-0000-7000-8000-000000000001",
      role: "leader",
      user: {
        id: "01952f1a-0000-7000-8000-000000000002",
        mail: "a@example.com",
        username: "ada",
        name: "Ada",
        phone: "+34600000001",
      },
    },
    {
      id: "01952f1a-0000-7000-8000-000000000003",
      role: "crew",
      user: {
        id: "01952f1a-0000-7000-8000-000000000004",
        mail: "b@example.com",
        username: "bob",
        name: "Bob",
        phone: "+34600000002",
      },
    },
  ],
}

describe("TripCard", () => {
  it("renders the destination", () => {
    render(<TripCard trip={BASE_TRIP} />)
    expect(screen.getByText("Costa Brava")).toBeDefined()
  })

  it("falls back to 'Untitled trip' when destination is absent", () => {
    render(<TripCard trip={{ ...BASE_TRIP, destination: undefined }} />)
    expect(screen.getByText("Untitled trip")).toBeDefined()
  })

  it("renders the state badge", () => {
    render(<TripCard trip={BASE_TRIP} />)
    expect(screen.getByText("Planning")).toBeDefined()
  })

  it("renders the date range", () => {
    render(<TripCard trip={BASE_TRIP} />)
    expect(screen.getByText(formatDateRange("2026-07-01", "2026-07-05"))).toBeDefined()
  })

  it("renders the crew count (mono numeral in its own span)", () => {
    render(<TripCard trip={BASE_TRIP} />)
    expect(
      screen.getByText((_, el) => el?.textContent?.replace(/\s+/g, " ").trim() === "2 members"),
    ).toBeDefined()
  })

  it("links to /trips/:id", () => {
    render(<TripCard trip={BASE_TRIP} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe(`/trips/${BASE_TRIP.id}`)
  })

  it("falls back to the shared 'Dates not set' label when dates are absent", () => {
    render(<TripCard trip={{ ...BASE_TRIP, dateFrom: undefined, dateTo: undefined }} />)
    expect(screen.getByText(formatDateRange(undefined, undefined))).toBeDefined()
  })

  it("renders the number of days derived from date range (inclusive — Jul 1-5 is 5 days)", () => {
    render(<TripCard trip={BASE_TRIP} />)
    expect(
      screen.getByText((_, el) => el?.textContent?.replace(/\s+/g, " ").trim() === "5 days"),
    ).toBeDefined()
  })

  it("omits day count when dates are absent", () => {
    render(<TripCard trip={{ ...BASE_TRIP, dateFrom: undefined, dateTo: undefined }} />)
    expect(screen.queryByText(/days/)).toBeNull()
  })
})
