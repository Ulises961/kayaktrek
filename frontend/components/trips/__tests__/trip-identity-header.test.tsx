import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { TripIdentityHeader } from "../trip-identity-header"
import type { Trip } from "@/lib/dtos/trip"

const TRIP: Trip = {
  id: "01952f1a-0000-7000-8000-000000000001",
  destination: "Cinque Terre",
  description: "A coastal paddle",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-05",
  difficulty: "moderate",
  state: "building",
  travellers: [
    {
      id: "member-1",
      role: "leader",
      user: { id: "u1", name: "Ada", surname: "Lovelace", mail: "a@example.com", username: "ada" },
    },
    {
      id: "member-2",
      role: "crew",
      user: {
        id: "u2",
        name: "Grace",
        surname: "Hopper",
        mail: "g@example.com",
        username: "grace",
      },
    },
  ],
}

describe("TripIdentityHeader", () => {
  it("shows the trip destination as the title", () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    expect(screen.getByRole("heading", { name: "Cinque Terre" })).toBeInTheDocument()
  })

  it("falls back to 'Untitled trip' when destination is unset", () => {
    render(<TripIdentityHeader trip={{ ...TRIP, destination: null }} isLeader={false} />)
    expect(screen.getByRole("heading", { name: "Untitled trip" })).toBeInTheDocument()
  })

  it("shows the state badge", () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    expect(screen.getByText("Planning")).toBeInTheDocument()
  })

  it("shows the date range with an inclusive day count", () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    expect(screen.getByText(/5 days/)).toBeInTheDocument()
  })

  it("shows one avatar per traveller", () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    // UserAvatar falls back to initials when there's no imageUrl.
    expect(screen.getByText("AL")).toBeInTheDocument()
    expect(screen.getByText("GH")).toBeInTheDocument()
  })

  it("shows an Edit trip link for the leader, pointing at the edit page", () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={true} />)
    const link = screen.getByRole("link", { name: /edit trip/i })
    expect(link.getAttribute("href")).toBe(`/trips/${TRIP.id}/edit`)
  })

  it("does not show an Edit trip link for crew", () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    expect(screen.queryByRole("link", { name: /edit trip/i })).not.toBeInTheDocument()
  })

  it("keeps description/difficulty collapsed behind a Details disclosure until clicked", async () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    expect(screen.queryByText("A coastal paddle")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByText("A coastal paddle")).toBeInTheDocument()
    expect(screen.getByText("Moderate")).toBeInTheDocument()
  })

  it("shows the advance-state action inside Details for the leader on a non-past trip", async () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={true} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByRole("button", { name: /begin expedition/i })).toBeInTheDocument()
  })

  it("does not show the advance-state action for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.queryByRole("button", { name: /begin expedition/i })).not.toBeInTheDocument()
  })

  it("shows a Printable float plan link inside Details for the leader", async () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={true} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    const link = screen.getByRole("link", { name: /printable float plan/i })
    expect(link.getAttribute("href")).toBe(`/trips/${TRIP.id}/float-plan`)
  })

  it("shows the trip-state timeline inside Details for the leader on a non-past trip", async () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={true} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByText("Happening")).toBeInTheDocument()
    expect(screen.getByText("Past")).toBeInTheDocument()
  })

  it("does not show the trip-state timeline for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} isLeader={false} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.queryByText("Happening")).not.toBeInTheDocument()
  })

  it("does not render a Details disclosure when there is nothing to show (crew, no description/difficulty)", () => {
    const bare: Trip = { ...TRIP, description: null, difficulty: null }
    render(<TripIdentityHeader trip={bare} isLeader={false} />)
    expect(screen.queryByRole("button", { name: /details/i })).not.toBeInTheDocument()
  })
})
