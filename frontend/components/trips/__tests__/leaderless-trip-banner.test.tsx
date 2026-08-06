import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/trips/actions", () => ({ claimLeadership: vi.fn() }))

import { LeaderlessTripBanner } from "../leaderless-trip-banner"
import { claimLeadership } from "@/lib/trips/actions"
import type { TripMember } from "@/lib/dtos/trip-member"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const LEADER: TripMember = {
  id: "member-1",
  role: "leader",
  user: { id: "u1", name: "Ada", surname: "Lovelace", mail: "a@example.com", username: "ada" },
}
const CREW_A: TripMember = {
  id: "member-2",
  role: "crew",
  user: { id: "u2", name: "Grace", surname: "Hopper", mail: "g@example.com", username: "grace" },
}
const CREW_B: TripMember = {
  id: "member-3",
  role: "crew",
  user: { id: "u3", name: "Mary", surname: "Jackson", mail: "m@example.com", username: "mary" },
}

describe("LeaderlessTripBanner", () => {
  it("renders nothing when a leader exists", () => {
    const { container } = render(
      <LeaderlessTripBanner
        tripId={TRIP_ID}
        tripState="building"
        travellers={[LEADER, CREW_A]}
        isMember={true}
        currentMemberId="member-2"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing on an archived trip even with no leader", () => {
    const { container } = render(
      <LeaderlessTripBanner
        tripId={TRIP_ID}
        tripState="archived"
        travellers={[CREW_A]}
        isMember={true}
        currentMemberId="member-2"
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("offers a claim button to any crew member when nobody was nominated", () => {
    render(
      <LeaderlessTripBanner
        tripId={TRIP_ID}
        tripState="building"
        travellers={[CREW_A, CREW_B]}
        isMember={true}
        currentMemberId="member-3"
      />,
    )
    expect(screen.getByText(/this trip has no leader/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /claim leadership/i })).toBeInTheDocument()
  })

  it("offers the claim button to the nominee", () => {
    const nominated = { ...CREW_A, nominatedSuccessor: true }
    render(
      <LeaderlessTripBanner
        tripId={TRIP_ID}
        tripState="building"
        travellers={[nominated, CREW_B]}
        isMember={true}
        currentMemberId="member-2"
      />,
    )
    expect(screen.getByRole("button", { name: /claim leadership/i })).toBeInTheDocument()
  })

  it("withholds the claim button from a non-nominee crew member and names the nominee", () => {
    const nominated = { ...CREW_A, nominatedSuccessor: true }
    render(
      <LeaderlessTripBanner
        tripId={TRIP_ID}
        tripState="building"
        travellers={[nominated, CREW_B]}
        isMember={true}
        currentMemberId="member-3"
      />,
    )
    expect(screen.queryByRole("button", { name: /claim leadership/i })).not.toBeInTheDocument()
    expect(screen.getByText(/waiting for grace hopper/i)).toBeInTheDocument()
  })

  it("calls claimLeadership when the claim button is clicked", async () => {
    vi.mocked(claimLeadership).mockResolvedValue({ success: true })
    render(
      <LeaderlessTripBanner
        tripId={TRIP_ID}
        tripState="building"
        travellers={[CREW_A]}
        isMember={true}
        currentMemberId="member-2"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /claim leadership/i }))
    expect(claimLeadership).toHaveBeenCalledWith(TRIP_ID)
  })

  it("shows an error and keeps the claim button when claiming fails", async () => {
    vi.mocked(claimLeadership).mockResolvedValue({
      success: false,
      error: "Someone else already claimed leadership.",
    })
    render(
      <LeaderlessTripBanner
        tripId={TRIP_ID}
        tripState="building"
        travellers={[CREW_A]}
        isMember={true}
        currentMemberId="member-2"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /claim leadership/i }))

    await waitFor(() =>
      expect(screen.getByText(/someone else already claimed leadership/i)).toBeInTheDocument(),
    )
    // The claim button is still offered — the banner didn't silently disappear.
    expect(screen.getByRole("button", { name: /claim leadership/i })).toBeInTheDocument()
  })
})
