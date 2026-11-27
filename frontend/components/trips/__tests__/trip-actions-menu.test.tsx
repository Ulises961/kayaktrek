import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

vi.mock("@/lib/trips/actions", () => ({
  updateTrip: vi.fn(),
  deleteTripForEveryone: vi.fn(),
  leaveTrip: vi.fn(),
  pauseTrip: vi.fn(),
  advanceState: vi.fn(),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  generateStoryShare: vi.fn().mockResolvedValue({ success: false, error: "unused" }),
}))

import { TripActionsMenu } from "../trip-actions-menu"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import { MEMBER_ROLE } from "@/lib/dtos/trip-member"
import { leaveTrip, pauseTrip, deleteTripForEveryone, advanceState } from "@/lib/trips/actions"
import { generateStoryShare } from "@/lib/itinerary/actions"

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

const HAPPENING: Trip = { ...TRIP, state: TRIP_STATE.HAPPENING }

const ITINERARY_ID = "01952f1a-0000-7000-8000-0000000000aa"
const WITH_ITINERARY: Trip = {
  ...TRIP,
  itinerary: { id: ITINERARY_ID, name: "Cinque Terre", isPublic: false, days: [] },
}

beforeEach(() => vi.clearAllMocks())

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: /trip actions/i }))
}

function item(name: RegExp) {
  return screen.queryByRole("menuitem", { name })
}

describe("TripActionsMenu — what each person is offered", () => {
  it("offers the leader edit, leave and delete, and pause only while the trip is happening", async () => {
    const { unmount } = render(<TripActionsMenu trip={TRIP} isLeader isMember />)
    await openMenu()
    expect(item(/edit trip/i)).toBeInTheDocument()
    expect(item(/leave trip/i)).toBeInTheDocument()
    expect(item(/delete trip/i)).toBeInTheDocument()
    expect(item(/pause expedition/i)).not.toBeInTheDocument()
    unmount()

    render(<TripActionsMenu trip={HAPPENING} isLeader isMember />)
    await openMenu()
    expect(item(/pause expedition/i)).toBeInTheDocument()
  })

  it("offers the leader the trip's next state: begin while planning, mark as past while happening", async () => {
    const { unmount } = render(<TripActionsMenu trip={TRIP} isLeader isMember />)
    await openMenu()
    expect(item(/begin expedition/i)).toBeInTheDocument()
    expect(item(/mark as past/i)).not.toBeInTheDocument()
    unmount()

    render(<TripActionsMenu trip={HAPPENING} isLeader isMember />)
    await openMenu()
    expect(item(/mark as past/i)).toBeInTheDocument()
    expect(item(/begin expedition/i)).not.toBeInTheDocument()
  })

  it("offers no next state once the trip is past", async () => {
    render(<TripActionsMenu trip={{ ...TRIP, state: TRIP_STATE.PAST }} isLeader isMember />)
    await openMenu()
    expect(item(/begin expedition|mark as past/i)).not.toBeInTheDocument()
    expect(item(/edit trip/i)).toBeInTheDocument()
  })

  it("offers no pause while the trip is already paused: Resume lives on the page", async () => {
    render(<TripActionsMenu trip={{ ...HAPPENING, isPaused: true }} isLeader isMember />)
    await openMenu()
    expect(item(/pause expedition/i)).not.toBeInTheDocument()
  })

  it("offers crew only Leave", async () => {
    render(<TripActionsMenu trip={HAPPENING} isLeader={false} isMember />)
    await openMenu()
    expect(item(/leave trip/i)).toBeInTheDocument()
    expect(item(/edit trip/i)).not.toBeInTheDocument()
    expect(item(/pause expedition/i)).not.toBeInTheDocument()
    expect(item(/mark as past|begin expedition/i)).not.toBeInTheDocument()
    expect(item(/delete trip/i)).not.toBeInTheDocument()
  })

  it("offers the leader Share story, and crew do not get it", async () => {
    const { unmount } = render(<TripActionsMenu trip={WITH_ITINERARY} isLeader isMember />)
    await openMenu()
    expect(item(/share story/i)).toBeInTheDocument()
    unmount()

    render(<TripActionsMenu trip={WITH_ITINERARY} isLeader={false} isMember />)
    await openMenu()
    expect(item(/share story/i)).not.toBeInTheDocument()
  })

  it("offers no Share story on a trip that has no itinerary to share", async () => {
    render(<TripActionsMenu trip={TRIP} isLeader isMember />)
    await openMenu()
    expect(item(/share story/i)).not.toBeInTheDocument()
  })

  it("holds only actions: the trip's difficulty is on the page, not in the menu", async () => {
    render(<TripActionsMenu trip={TRIP} isLeader isMember />)
    await openMenu()
    expect(screen.queryByText(/difficulty/i)).not.toBeInTheDocument()
  })

  it("renders nothing for someone with no actions to offer", () => {
    const { container } = render(<TripActionsMenu trip={TRIP} isLeader={false} isMember={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe("TripActionsMenu — each item opens its own confirmation, and nothing happens before it", () => {
  it("opens the edit dialog on the trip's current values", async () => {
    render(<TripActionsMenu trip={TRIP} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/edit trip/i)!)

    expect(await screen.findByRole("dialog", { name: /edit trip/i })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: /destination/i })).toHaveValue("Cinque Terre")
  })

  it("opens the story link dialog for this trip's itinerary, creating nothing until asked", async () => {
    render(<TripActionsMenu trip={WITH_ITINERARY} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/share story/i)!)

    expect(await screen.findByRole("dialog", { name: /share trip story/i })).toBeInTheDocument()
    expect(generateStoryShare).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: /create link/i }))
    expect(generateStoryShare).toHaveBeenCalledWith(ITINERARY_ID)
  })

  it("shows an existing story link straight away", async () => {
    const shared: Trip = {
      ...WITH_ITINERARY,
      itinerary: { ...WITH_ITINERARY.itinerary!, storyShareToken: "tok_existing" },
    }
    render(<TripActionsMenu trip={shared} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/share story/i)!)

    expect(await screen.findByText(/tok_existing/)).toBeInTheDocument()
  })

  it("asks before beginning the expedition, and moves this trip to happening once confirmed", async () => {
    vi.mocked(advanceState).mockResolvedValue({ success: true })
    render(<TripActionsMenu trip={TRIP} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/begin expedition/i)!)

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()
    expect(advanceState).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }))
    expect(advanceState).toHaveBeenCalledWith(TRIP.id, TRIP_STATE.HAPPENING)
  })

  it("asks before marking a happening trip as past, and does nothing when cancelled", async () => {
    render(<TripActionsMenu trip={HAPPENING} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/mark as past/i)!)

    expect(await screen.findByText(/the trip will be marked as completed/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(advanceState).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("asks before pausing, and pauses this trip once confirmed", async () => {
    vi.mocked(pauseTrip).mockResolvedValue({ success: true })
    render(<TripActionsMenu trip={HAPPENING} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/pause expedition/i)!)

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument()
    expect(pauseTrip).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: /^pause$/i }))
    expect(pauseTrip).toHaveBeenCalledWith(TRIP.id)
  })

  it("asks before leaving, and leaves this trip once confirmed", async () => {
    render(<TripActionsMenu trip={TRIP} isLeader={false} isMember />)
    await openMenu()
    await userEvent.click(item(/leave trip/i)!)

    expect(await screen.findByText("Leave this trip?")).toBeInTheDocument()
    expect(leaveTrip).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Leave" }))
    expect(leaveTrip).toHaveBeenCalledWith(TRIP.id)
  })

  it("warns that leaving as the only member deletes the trip", async () => {
    const solo: Trip = { ...TRIP, travellers: [TRIP.travellers![0]] }
    render(<TripActionsMenu trip={solo} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/leave trip/i)!)

    expect(await screen.findByText(/delete this trip and all its data/i)).toBeInTheDocument()
  })

  it("asks before deleting, names the trip, and deletes nothing when cancelled", async () => {
    render(<TripActionsMenu trip={TRIP} isLeader isMember />)
    await openMenu()
    await userEvent.click(item(/delete trip/i)!)

    expect(await screen.findByText("Delete Cinque Terre?")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(deleteTripForEveryone).not.toHaveBeenCalled()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })
})
