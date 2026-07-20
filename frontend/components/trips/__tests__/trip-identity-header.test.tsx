import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/trips/actions", () => ({
  updateTrip: vi.fn(),
  deleteTripForEveryone: vi.fn(),
  leaveTrip: vi.fn(),
  nominateSuccessor: vi.fn(),
  clearNomination: vi.fn(),
  claimLeadership: vi.fn(),
}))

import { TripIdentityHeader } from "../trip-identity-header"
import type { Trip } from "@/lib/dtos/trip"
import type { Membership } from "@/lib/trips/membership"

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

const LEADER_MEMBERSHIP: Membership = {
  isLeader: true,
  isMember: true,
  currentMemberId: "member-1",
  leaderId: "u1",
}

const CREW_MEMBERSHIP: Membership = {
  isLeader: false,
  isMember: true,
  currentMemberId: "member-2",
  leaderId: "u1",
}

const NON_MEMBER: Membership = {
  isLeader: false,
  isMember: false,
}

describe("TripIdentityHeader", () => {
  it("shows the trip destination as the title", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByRole("heading", { name: "Cinque Terre" })).toBeInTheDocument()
  })

  it("falls back to 'Untitled trip' when destination is unset", () => {
    render(
      <TripIdentityHeader trip={{ ...TRIP, destination: null }} membership={CREW_MEMBERSHIP} />,
    )
    expect(screen.getByRole("heading", { name: "Untitled trip" })).toBeInTheDocument()
  })

  it("shows the state badge", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText("Planning")).toBeInTheDocument()
  })

  it("shows the date range with an inclusive day count", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText(/5 days/)).toBeInTheDocument()
  })

  it("shows one avatar per traveller", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    // UserAvatar falls back to initials when there's no imageUrl.
    expect(screen.getByText("AL")).toBeInTheDocument()
    expect(screen.getByText("GH")).toBeInTheDocument()
  })

  it("opens the edit dialog for the leader on pencil click", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /edit trip/i }))
    expect(screen.getByRole("dialog", { name: /edit trip/i })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /destination/i })).toHaveValue("Cinque Terre")
  })

  it("does not show an edit affordance for crew", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByRole("button", { name: /edit trip/i })).not.toBeInTheDocument()
  })

  it("shows a delete affordance for the leader that opens a confirm dialog", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /delete trip/i }))
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
    expect(screen.getByText(/delete cinque terre\?/i)).toBeInTheDocument()
  })

  it("does not show a delete affordance for crew", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByRole("button", { name: /delete trip/i })).not.toBeInTheDocument()
  })

  it("keeps description/difficulty collapsed behind a Details disclosure until clicked", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByText("A coastal paddle")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByText("A coastal paddle")).toBeInTheDocument()
    expect(screen.getByText("Moderate")).toBeInTheDocument()
  })

  it("shows the advance-state action inside Details for the leader on a non-past trip", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByRole("button", { name: /begin expedition/i })).toBeInTheDocument()
  })

  it("does not show the advance-state action for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.queryByRole("button", { name: /begin expedition/i })).not.toBeInTheDocument()
  })

  it("shows a Printable float plan link inside Details for the leader", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    const link = screen.getByRole("link", { name: /printable float plan/i })
    expect(link.getAttribute("href")).toBe(`/trips/${TRIP.id}/float-plan`)
  })

  it("shows the trip-state timeline inside Details for the leader on a non-past trip", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByText("Happening")).toBeInTheDocument()
    expect(screen.getByText("Past")).toBeInTheDocument()
  })

  it("does not show the trip-state timeline for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.queryByText("Happening")).not.toBeInTheDocument()
  })

  it("does not render a Details disclosure for a non-member with nothing to show", () => {
    const bare: Trip = { ...TRIP, description: null, difficulty: null }
    render(<TripIdentityHeader trip={bare} membership={NON_MEMBER} />)
    expect(screen.queryByRole("button", { name: /details/i })).not.toBeInTheDocument()
  })

  it("shows a Leave trip affordance inside Details for any member", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByRole("button", { name: /leave trip/i })).toBeInTheDocument()
  })

  it("shows a successor-nomination affordance inside Details for the leader only", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.getByRole("button", { name: /nominate a successor/i })).toBeInTheDocument()
  })

  it("does not show a successor-nomination affordance for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
    expect(screen.queryByRole("button", { name: /nominate a successor/i })).not.toBeInTheDocument()
  })

  it("shows the leaderless banner when no traveller is the leader", () => {
    const leaderless: Trip = {
      ...TRIP,
      travellers: TRIP.travellers!.map((m) => ({ ...m, role: "crew" })),
    }
    render(<TripIdentityHeader trip={leaderless} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText(/this trip has no leader/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /claim leadership/i })).toBeInTheDocument()
  })

  it("does not show the leaderless banner when a leader exists", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByText(/this trip has no leader/i)).not.toBeInTheDocument()
  })
})
