import type { ComponentProps } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/trips/actions", () => ({
  updateTrip: vi.fn(),
  deleteTripForEveryone: vi.fn(),
  leaveTrip: vi.fn(),
  advanceState: vi.fn(),
  pauseTrip: vi.fn(),
  resumeTrip: vi.fn(),
  abortTrip: vi.fn(),
}))

import { TripIdentityHeader as Header } from "../trip-identity-header"
import { DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import { MEMBER_ROLE, type TripMember } from "@/lib/dtos/trip-member"
import type { Membership } from "@/lib/trips/membership"
import { addDaysIso, todayIso } from "@/lib/utils/date"
import { daysBetween, formatDateRange } from "@/lib/trips/format"

const TODAY = todayIso()

// Today's date defaults to the real one; the day-label tests build their dates around it.
function TripIdentityHeader(
  props: Omit<ComponentProps<typeof Header>, "today"> &
    Partial<Pick<ComponentProps<typeof Header>, "today">>,
) {
  return <Header today={TODAY} {...props} />
}

const TRIP: Trip = {
  id: "01952f1a-0000-7000-8000-000000000001",
  destination: "Cinque Terre",
  description: "A coastal paddle",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-05",
  difficulty: "moderate",
  state: TRIP_STATE.BUILDING,
  travellers: [
    {
      id: "member-1",
      role: MEMBER_ROLE.LEADER,
      user: { id: "u1", name: "Ada", surname: "Lovelace", mail: "a@example.com", username: "ada" },
    },
    {
      id: "member-2",
      role: MEMBER_ROLE.CREW,
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

beforeEach(() => vi.clearAllMocks())

describe("TripIdentityHeader — identity", () => {
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

  it("shows the trip's difficulty beside its state, as a property of the trip", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText(DIFFICULTY_LABELS[TRIP.difficulty!])).toBeInTheDocument()
  })

  it("shows no difficulty when the trip has none", () => {
    render(<TripIdentityHeader trip={{ ...TRIP, difficulty: null }} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByText(DIFFICULTY_LABELS[TRIP.difficulty!])).not.toBeInTheDocument()
  })

  it("shows the date range with an inclusive day count while the trip is not happening", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText(formatDateRange(TRIP.dateFrom, TRIP.dateTo))).toBeInTheDocument()
    expect(
      screen.getByText(`(${daysBetween(TRIP.dateFrom!, TRIP.dateTo!)} days)`),
    ).toBeInTheDocument()
  })

  it("carries no description and no Details disclosure: the trip card and the Edit dialog hold them", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByText("A coastal paddle")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /details/i })).not.toBeInTheDocument()
  })

  it("shows the leaderless banner when no traveller is the leader", () => {
    const leaderless: Trip = {
      ...TRIP,
      travellers: TRIP.travellers!.map((m) => ({ ...m, role: MEMBER_ROLE.CREW })),
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

describe("TripIdentityHeader — day label", () => {
  const underway: Trip = {
    ...TRIP,
    state: TRIP_STATE.HAPPENING,
    dateFrom: addDaysIso(TODAY, -2),
    dateTo: addDaysIso(TODAY, 4),
  }

  it("says which day of the trip it is while the trip is happening, in place of the count", () => {
    render(<TripIdentityHeader trip={underway} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText("Day 3 of 7")).toBeInTheDocument()
    expect(screen.queryByText(/\(7 days\)/)).not.toBeInTheDocument()
  })

  it("says the trip is paused, and on which day", () => {
    const paused: Trip = {
      ...underway,
      isPaused: true,
      pausedAt: `${addDaysIso(TODAY, -1)}T09:30:00`,
    }
    render(<TripIdentityHeader trip={paused} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText("Paused on day 2")).toBeInTheDocument()
  })

  it("falls back to the plain count when today is outside the trip's dates", () => {
    const early: Trip = {
      ...underway,
      dateFrom: addDaysIso(TODAY, 3),
      dateTo: addDaysIso(TODAY, 5),
    }
    render(<TripIdentityHeader trip={early} membership={CREW_MEMBERSHIP} />)
    expect(screen.queryByText(/^Day \d/)).not.toBeInTheDocument()
    expect(screen.getByText("(3 days)")).toBeInTheDocument()
  })
})

describe("TripIdentityHeader — crew", () => {
  it("shows one avatar per traveller", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    // UserAvatar falls back to initials when there's no imageUrl.
    expect(screen.getByText("AL")).toBeInTheDocument()
    expect(screen.getByText("GH")).toBeInTheDocument()
  })

  it("links the avatars to the Crew tab", () => {
    render(<TripIdentityHeader trip={TRIP} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByRole("link", { name: /crew, 2/i })).toHaveAttribute(
      "href",
      `/trips/${TRIP.id}/crew`,
    )
  })

  it("counts the travellers beyond the avatars it shows", () => {
    const crowd: Trip = {
      ...TRIP,
      travellers: Array.from({ length: 8 }, (_, i) => ({
        id: `member-${i}`,
        role: i === 0 ? MEMBER_ROLE.LEADER : MEMBER_ROLE.CREW,
        user: {
          id: `u${i}`,
          name: "P",
          surname: String(i),
          mail: `p${i}@e.com`,
          username: `p${i}`,
        },
      })),
    }
    render(<TripIdentityHeader trip={crowd} membership={CREW_MEMBERSHIP} />)
    expect(screen.getByText("+3")).toBeInTheDocument()
  })
})

describe("TripIdentityHeader — the trip menu and the state controls", () => {
  it.each([TRIP_STATE.BUILDING, TRIP_STATE.HAPPENING])(
    "keeps the state step off the page while the trip is %s: it is in the menu",
    (state) => {
      render(<TripIdentityHeader trip={{ ...TRIP, state }} membership={LEADER_MEMBERSHIP} />)
      expect(screen.queryByRole("button", { name: /begin expedition|mark as past/i })).toBeNull()
      expect(screen.getByRole("button", { name: /trip actions/i })).toBeInTheDocument()
    },
  )

  it("keeps the trip menu out of the way: nothing it holds is on the page until it is opened", () => {
    render(<TripIdentityHeader trip={TRIP} membership={LEADER_MEMBERSHIP} />)
    expect(screen.getByRole("button", { name: /trip actions/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /leave trip|delete trip|edit trip/i })).toBeNull()
    expect(screen.queryByText(/nominate a successor/i)).not.toBeInTheDocument()
  })

  it("shows the paused banner with Resume and Abort on the page, for the leader", () => {
    const paused: Trip = {
      ...TRIP,
      state: TRIP_STATE.HAPPENING,
      isPaused: true,
      pausedAt: "2026-07-03",
    }
    render(<TripIdentityHeader trip={paused} membership={LEADER_MEMBERSHIP} />)
    expect(screen.getByText(/expedition paused since/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^resume$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /abort expedition/i })).toBeInTheDocument()
  })
})

describe("TripIdentityHeader — what is not here", () => {
  it("carries no inReach notice: it belongs to the inReach section of the Float plan tab", () => {
    const member: TripMember = { ...TRIP.travellers![1], sharesSatellitePosition: false }
    render(
      <TripIdentityHeader
        trip={{ ...TRIP, state: TRIP_STATE.HAPPENING }}
        membership={{ ...CREW_MEMBERSHIP, currentMember: member }}
      />,
    )
    expect(screen.queryByText(/inreach/i)).not.toBeInTheDocument()
  })

  it("offers someone who is not a member the trip but no menu of actions", () => {
    render(<TripIdentityHeader trip={TRIP} membership={NON_MEMBER} />)
    expect(screen.getByRole("heading", { name: "Cinque Terre" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /trip actions/i })).not.toBeInTheDocument()
  })
})
