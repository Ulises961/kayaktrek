import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/connections/actions", () => ({ listConnections: vi.fn().mockResolvedValue([]) }))

import { CrewTab } from "../crew-tab"
import type { Trip } from "@/lib/dtos/trip"

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

  it("does not show any invite affordance for non-leaders", () => {
    render(<CrewTab tripId="trip-1" trip={trip()} isLeader={false} />)
    expect(screen.queryByRole("button", { name: /invite a buddy/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/invite member/i)).not.toBeInTheDocument()
  })
})
