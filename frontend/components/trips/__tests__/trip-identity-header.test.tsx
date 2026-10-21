import type { ComponentProps } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/trips/actions", () => ({
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
  advanceState: vi.fn(),
  pauseTrip: vi.fn(),
  resumeTrip: vi.fn(),
  abortTrip: vi.fn(),
}))

vi.mock("@/lib/trip-member/actions", () => ({
  setSatelliteTracking: vi.fn(),
}))

import { TripIdentityHeader as Header } from "../trip-identity-header"
import { DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"
import type { Membership } from "@/lib/trips/membership"
import { setSatelliteTracking } from "@/lib/trip-member/actions"

// Most of these tests are about the rest of the header, where a registered feed is
// the ordinary case; the inReach tests below say so explicitly when they need otherwise.
function TripIdentityHeader(
  props: Omit<ComponentProps<typeof Header>, "hasSatelliteFeed"> & { hasSatelliteFeed?: boolean },
) {
  return <Header hasSatelliteFeed {...props} />
}

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

  async function openDetails() {
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
  }

  it("keeps the Details disclosure collapsed by default", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByText("A coastal paddle")).not.toBeInTheDocument()
  })

  it("shows description/difficulty once Details is expanded, each under its own label", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await openDetails()
    expect(screen.getByText("A coastal paddle")).toBeInTheDocument()
    expect(screen.getByText(DIFFICULTY_LABELS[TRIP.difficulty!])).toBeInTheDocument()
    // Labelled the same way as the action sub-sections below them, so every block
    // inside Details is introduced rather than only some.
    expect(screen.getByText("Description")).toBeInTheDocument()
    expect(screen.getByText("Difficulty")).toBeInTheDocument()
  })

  it("collapses Details again on a second click", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await openDetails()
    await openDetails()
    expect(screen.queryByText("A coastal paddle")).not.toBeInTheDocument()
  })

  it("shows the advance-state action inside Details for the leader on a non-past trip", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await openDetails()
    expect(screen.getByRole("button", { name: /begin expedition/i })).toBeInTheDocument()
  })

  it("does not show the advance-state action for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await openDetails()
    expect(screen.queryByRole("button", { name: /begin expedition/i })).not.toBeInTheDocument()
  })

  it("shows a Printable float plan link inside Details for the leader", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await openDetails()
    const link = screen.getByRole("link", { name: /printable float plan/i })
    expect(link.getAttribute("href")).toBe(`/trips/float-plan/${TRIP.id}`)
  })

  it("shows the trip-state timeline inside Details for the leader on a non-past trip", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await openDetails()
    expect(screen.getByText("Happening")).toBeInTheDocument()
    expect(screen.getByText("Past")).toBeInTheDocument()
  })

  it("does not show the trip-state timeline for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await openDetails()
    expect(screen.queryByText("Happening")).not.toBeInTheDocument()
  })

  it("shows pause controls inside Details for the leader on a happening trip", async () => {
    render(
      <TripIdentityHeader trip={{ ...TRIP, state: "happening" }} membership={LEADER_MEMBERSHIP} />,
    )
    await openDetails()
    expect(screen.getByRole("button", { name: /pause expedition/i })).toBeInTheDocument()
  })

  it("does not show pause controls for crew", async () => {
    render(
      <TripIdentityHeader trip={{ ...TRIP, state: "happening" }} membership={CREW_MEMBERSHIP} />,
    )
    await openDetails()
    expect(screen.queryByRole("button", { name: /pause expedition/i })).not.toBeInTheDocument()
  })

  it("does not render a Details disclosure when there is nothing to show (crew, no description/difficulty)", () => {
    const bare: Trip = { ...TRIP, description: null, difficulty: null }
    render(<TripIdentityHeader trip={bare} membership={NON_MEMBER} />)
    expect(screen.queryByRole("button", { name: /details/i })).not.toBeInTheDocument()
  })

  it("shows a Leave trip affordance inside Details for any member", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await openDetails()
    expect(screen.getByRole("button", { name: /leave trip/i })).toBeInTheDocument()
  })

  it("shows a successor-nomination affordance inside Details for the leader only", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    await openDetails()
    expect(screen.getByRole("button", { name: /nominate a successor/i })).toBeInTheDocument()
  })

  it("does not show a successor-nomination affordance for crew", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    await openDetails()
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

describe("TripIdentityHeader, inReach switch (M29)", () => {
  const SWITCH_NAME = "Share my inReach on this trip"

  beforeEach(() => vi.clearAllMocks())

  function crewMembership(overrides: Partial<TripMember> = {}): Membership {
    const currentMember: TripMember = { ...TRIP.travellers![1], ...overrides }
    return {
      isLeader: false,
      isMember: true,
      currentMember,
      currentMemberId: currentMember.id,
      leaderId: "u1",
    }
  }

  async function openDetails() {
    await userEvent.click(screen.getByRole("button", { name: /details/i }))
  }

  it("keeps the switch inside Details, out of sight until it is opened", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={crewMembership()} />)
    expect(screen.queryByRole("switch", { name: SWITCH_NAME })).not.toBeInTheDocument()

    await openDetails()

    expect(screen.getByText("inReach tracking")).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeInTheDocument()
  })

  it.each([TRIP_STATE.BUILDING, TRIP_STATE.HAPPENING])(
    "offers the switch to a member while the trip is %s",
    async (state) => {
      render(<TripIdentityHeader trip={{ ...TRIP, state }} membership={crewMembership()} />)
      await openDetails()
      expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeInTheDocument()
    },
  )

  it("offers it to the leader too: it is every member's own switch", async () => {
    const leader = TRIP.travellers![0]
    render(
      <TripIdentityHeader
        trip={TRIP}
        membership={{ ...LEADER_MEMBERSHIP, currentMember: leader }}
      />,
    )
    await openDetails()
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeInTheDocument()
  })

  it("offers no switch once the trip is past", async () => {
    render(
      <TripIdentityHeader
        trip={{ ...TRIP, state: TRIP_STATE.PAST }}
        membership={crewMembership()}
      />,
    )
    await openDetails()
    expect(screen.queryByRole("switch", { name: SWITCH_NAME })).not.toBeInTheDocument()
    expect(screen.queryByText("inReach tracking")).not.toBeInTheDocument()
  })

  it("offers no switch to someone who is not a member", async () => {
    render(<TripIdentityHeader trip={TRIP} membership={NON_MEMBER} />)
    await openDetails()
    expect(screen.queryByRole("switch", { name: SWITCH_NAME })).not.toBeInTheDocument()
  })

  it("offers no switch to a member who has left", async () => {
    render(
      <TripIdentityHeader
        trip={TRIP}
        membership={crewMembership({ leftAt: "2026-10-02T09:30:00" })}
      />,
    )
    await openDetails()
    expect(screen.queryByRole("switch", { name: SWITCH_NAME })).not.toBeInTheDocument()
  })

  it("shows the member's own setting: on when they have it on, off when the field is absent", async () => {
    const { unmount } = render(
      <TripIdentityHeader
        trip={TRIP}
        membership={crewMembership({ sharesSatellitePosition: true })}
      />,
    )
    await openDetails()
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
      "aria-checked",
      "true",
    )
    unmount()

    render(<TripIdentityHeader trip={TRIP} membership={crewMembership()} />)
    await openDetails()
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
      "aria-checked",
      "false",
    )
  })

  it("cannot be switched on without a registered feed, and points at Settings", async () => {
    render(
      <TripIdentityHeader trip={TRIP} membership={crewMembership()} hasSatelliteFeed={false} />,
    )
    await openDetails()

    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeDisabled()
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
  })

  it("switches the feed on for this trip, not another", async () => {
    vi.mocked(setSatelliteTracking).mockResolvedValue({ success: true })
    render(<TripIdentityHeader trip={TRIP} membership={crewMembership()} />)
    await openDetails()

    await userEvent.click(screen.getByRole("switch", { name: SWITCH_NAME }))

    expect(setSatelliteTracking).toHaveBeenCalledWith(TRIP.id, true)
  })
})
