import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/connections/actions", () => ({ listConnections: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/trips/actions", () => ({ nominateSuccessor: vi.fn(), clearNomination: vi.fn() }))

import { CrewTab } from "../crew-tab"
import type { Trip } from "@/lib/dtos/trip"
import { MEMBER_ROLE, type TripMember } from "@/lib/dtos/trip-member"

const LEADER_ID = "01952f1a-0000-7000-8000-000000000001"

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: "01952f1a-0000-7000-8000-000000000010",
    destination: "Fjords",
    travellers: [],
    pendingTravellers: [],
    ...overrides,
  } as Trip
}

describe("CrewTab", () => {
  it("shows the buddy picker as the sole invite affordance for the leader", () => {
    render(<CrewTab tripId="trip-1" trip={trip()} isLeader leaderId={LEADER_ID} />)
    expect(screen.getByRole("button", { name: /invite a buddy/i })).toBeInTheDocument()
    // The retired email InviteForm had a labelled email input — assert it's gone.
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
  })

  function member(id: string, role: TripMember["role"]): TripMember {
    return {
      id: `member-${id}`,
      role,
      user: { id: id, name: id, mail: `${id}@example.com`, username: id },
    }
  }

  it("lets the leader nominate a successor once there is crew to nominate", () => {
    const crewed = trip({
      travellers: [member("ada", MEMBER_ROLE.LEADER), member("bob", MEMBER_ROLE.CREW)],
    })
    render(<CrewTab tripId="trip-1" trip={crewed} isLeader leaderId={LEADER_ID} />)
    expect(screen.getByText("Successor")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /nominate a successor/i })).toBeInTheDocument()
  })

  it("offers no successor section to a leader travelling alone: there is no one to nominate", () => {
    const alone = trip({ travellers: [member("ada", MEMBER_ROLE.LEADER)] })
    render(<CrewTab tripId="trip-1" trip={alone} isLeader leaderId={LEADER_ID} />)
    expect(screen.queryByText("Successor")).not.toBeInTheDocument()
  })

  it("offers no successor section to crew", () => {
    const crewed = trip({
      travellers: [member("ada", MEMBER_ROLE.LEADER), member("bob", MEMBER_ROLE.CREW)],
    })
    render(<CrewTab tripId="trip-1" trip={crewed} isLeader={false} />)
    expect(screen.queryByText("Successor")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /nominate a successor/i })).not.toBeInTheDocument()
  })

  it("does not show any invite affordance for non-leaders", () => {
    render(<CrewTab tripId="trip-1" trip={trip()} isLeader={false} />)
    expect(screen.queryByRole("button", { name: /invite a buddy/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/invite member/i)).not.toBeInTheDocument()
  })
})
