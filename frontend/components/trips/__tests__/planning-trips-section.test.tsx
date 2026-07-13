import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlanningTripsSection, PLANNING_SORT } from "../planning-trips-section"
import type { Trip } from "@/lib/dtos/trip"

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "01952f1a-0000-7000-8000-000000000030",
    destination: "Untitled trip",
    state: "building",
    dateFrom: null,
    dateTo: null,
    travellers: [],
    ...overrides,
  } as Trip
}

// TripCard wraps the whole card in one <Link>, whose textContent concatenates
// destination + dates + crew count — so "order" is which destination label
// each link's text *contains*, not an exact match.
function renderedOrder(labels: string[]): string[] {
  const links = screen.getAllByRole("link")
  return links
    .map((el) => labels.find((label) => el.textContent?.includes(label)))
    .filter((label): label is string => !!label)
}

describe("PlanningTripsSection", () => {
  it("renders all trips", () => {
    render(
      <PlanningTripsSection
        trips={[
          trip({ id: "a", destination: "Fjords" }),
          trip({ id: "b", destination: "Skerries" }),
        ]}
      />,
    )
    expect(screen.getByText("Fjords")).toBeInTheDocument()
    expect(screen.getByText("Skerries")).toBeInTheDocument()
  })

  it("defaults to soonest-first, undated trips last", () => {
    render(
      <PlanningTripsSection
        trips={[
          trip({ id: "a", destination: "Later", dateFrom: "2026-09-01" }),
          trip({ id: "b", destination: "Sooner", dateFrom: "2026-08-01" }),
          trip({ id: "c", destination: "Undated", dateFrom: null }),
        ]}
      />,
    )
    const order = renderedOrder(["Sooner", "Later", "Undated"])
    expect(order.indexOf("Sooner")).toBeLessThan(order.indexOf("Later"))
    expect(order.indexOf("Later")).toBeLessThan(order.indexOf("Undated"))
  })

  it("reverses to latest-first when toggled", async () => {
    render(
      <PlanningTripsSection
        trips={[
          trip({ id: "a", destination: "Later", dateFrom: "2026-09-01" }),
          trip({ id: "b", destination: "Sooner", dateFrom: "2026-08-01" }),
        ]}
      />,
    )
    await userEvent.selectOptions(screen.getByLabelText(/sort trips/i), PLANNING_SORT.LATEST)
    const order = renderedOrder(["Sooner", "Later"])
    expect(order.indexOf("Later")).toBeLessThan(order.indexOf("Sooner"))
  })
})
