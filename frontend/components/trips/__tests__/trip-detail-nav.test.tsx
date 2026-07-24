import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const { mockUsePathname } = vi.hoisted(() => ({ mockUsePathname: vi.fn() }))

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}))

import { TripDetailNav } from "../trip-detail-nav"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

describe("TripDetailNav", () => {
  it("renders a link for each always-visible segment", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(<TripDetailNav tripId={TRIP_ID} showFloatPlan={false} />)
    expect(screen.getByRole("link", { name: /itinerary/i }).getAttribute("href")).toBe(
      `/trips/${TRIP_ID}`,
    )
    expect(screen.getByRole("link", { name: /crew/i }).getAttribute("href")).toBe(
      `/trips/${TRIP_ID}/crew`,
    )
    expect(screen.getByRole("link", { name: /logistics/i }).getAttribute("href")).toBe(
      `/trips/${TRIP_ID}/logistics`,
    )
    expect(screen.getByRole("link", { name: /items/i }).getAttribute("href")).toBe(
      `/trips/${TRIP_ID}/items`,
    )
  })

  it("Itinerary is the first link (itinerary-first ordering)", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(<TripDetailNav tripId={TRIP_ID} showFloatPlan={false} />)
    const links = screen.getAllByRole("link")
    expect(links[0]).toHaveAccessibleName(/itinerary/i)
  })

  it("hides the Emergency info link when showFloatPlan is false", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(<TripDetailNav tripId={TRIP_ID} showFloatPlan={false} />)
    expect(screen.queryByRole("link", { name: /emergency info/i })).not.toBeInTheDocument()
  })

  it("shows the Emergency info link pointing at my-float-plan when showFloatPlan is true", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(<TripDetailNav tripId={TRIP_ID} showFloatPlan={true} />)
    expect(screen.getByRole("link", { name: /emergency info/i }).getAttribute("href")).toBe(
      `/trips/${TRIP_ID}/my-float-plan`,
    )
  })

  it("marks the itinerary link active only on the exact index route", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}/crew`)
    render(<TripDetailNav tripId={TRIP_ID} showFloatPlan={false} />)
    expect(screen.getByRole("link", { name: /itinerary/i })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("link", { name: /crew/i })).toHaveAttribute("aria-current", "page")
  })

  it("hides the Live link when liveHref is absent", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(<TripDetailNav tripId={TRIP_ID} showFloatPlan={false} />)
    expect(screen.queryByRole("link", { name: /live/i })).not.toBeInTheDocument()
  })

  it("shows the Live link pointing at the itinerary's navigate deep link", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(
      <TripDetailNav
        tripId={TRIP_ID}
        showFloatPlan={false}
        liveHref="/itinerary/itin-1?navigate=1"
      />,
    )
    expect(screen.getByRole("link", { name: /live/i }).getAttribute("href")).toBe(
      "/itinerary/itin-1?navigate=1",
    )
  })

  it("puts Live first in the list, ahead of Itinerary", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(
      <TripDetailNav
        tripId={TRIP_ID}
        showFloatPlan={false}
        liveHref="/itinerary/itin-1?navigate=1"
      />,
    )
    const links = screen.getAllByRole("link")
    expect(links[0]).toHaveAccessibleName(/live/i)
    expect(links[1]).toHaveAccessibleName(/itinerary/i)
  })

  it("never marks Live as the active tab (it's an outbound link, not a trip-detail segment)", () => {
    mockUsePathname.mockReturnValue(`/trips/${TRIP_ID}`)
    render(
      <TripDetailNav
        tripId={TRIP_ID}
        showFloatPlan={false}
        liveHref="/itinerary/itin-1?navigate=1"
      />,
    )
    expect(screen.getByRole("link", { name: /live/i })).not.toHaveAttribute("aria-current")
  })
})
