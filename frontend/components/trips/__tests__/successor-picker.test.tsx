import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/trips/actions", () => ({
  nominateSuccessor: vi.fn(),
  clearNomination: vi.fn(),
}))

import { SuccessorPicker } from "../successor-picker"
import { nominateSuccessor, clearNomination } from "@/lib/trips/actions"
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

describe("SuccessorPicker", () => {
  it("renders nothing when there is no crew to nominate", () => {
    const { container } = render(<SuccessorPicker tripId={TRIP_ID} travellers={[LEADER]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("lists crew candidates, excluding the leader", async () => {
    render(<SuccessorPicker tripId={TRIP_ID} travellers={[LEADER, CREW_A, CREW_B]} />)
    await userEvent.click(screen.getByRole("button", { name: /nominate a successor/i }))
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
    expect(screen.getByText("Mary Jackson")).toBeInTheDocument()
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument()
  })

  it("nominates the clicked candidate", async () => {
    vi.mocked(nominateSuccessor).mockResolvedValue({ success: true })
    render(<SuccessorPicker tripId={TRIP_ID} travellers={[LEADER, CREW_A, CREW_B]} />)
    await userEvent.click(screen.getByRole("button", { name: /nominate a successor/i }))
    await userEvent.click(screen.getByText("Grace Hopper"))
    expect(nominateSuccessor).toHaveBeenCalledWith(TRIP_ID, "u2")
  })

  it("shows the current nominee with a clear affordance instead of the picker", () => {
    const nominated = { ...CREW_A, nominatedSuccessor: true }
    render(<SuccessorPicker tripId={TRIP_ID} travellers={[LEADER, nominated, CREW_B]} />)
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /nominate a successor/i })).not.toBeInTheDocument()
  })

  it("clears the nomination when the clear button is clicked", async () => {
    vi.mocked(clearNomination).mockResolvedValue({ success: true })
    const nominated = { ...CREW_A, nominatedSuccessor: true }
    render(<SuccessorPicker tripId={TRIP_ID} travellers={[LEADER, nominated, CREW_B]} />)
    await userEvent.click(screen.getByRole("button", { name: /clear nomination/i }))
    expect(clearNomination).toHaveBeenCalledWith(TRIP_ID)
  })
})
