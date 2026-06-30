import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/trips/actions", () => ({ getTripCrew: vi.fn() }))
vi.mock("@/lib/endorsement-requests/actions", () => ({ requestEndorsement: vi.fn() }))

import { getTripCrew } from "@/lib/trips/actions"
import { requestEndorsement } from "@/lib/endorsement-requests/actions"
import { AskToEndorsePicker } from "../ask-to-endorse-picker"
import type { TripMember } from "@/lib/dtos/trip-member"

const LOG_ID = "01952f1a-0000-7000-8000-0000000000e1"
const TRIP_ID = "01952f1a-0000-7000-8000-0000000000f1"
const AUTHOR = "01952f1a-0000-7000-8000-000000000001"
const ENDORSER = "01952f1a-0000-7000-8000-00000000000a"
const CANDIDATE = "01952f1a-0000-7000-8000-00000000000b"

const member = (id: string, name: string): TripMember => ({
  role: "crew",
  user: { id, mail: `${name}@x.io`, username: name.toLowerCase(), name, surname: null },
})

const CREW: TripMember[] = [
  member(AUTHOR, "Author"),
  member(ENDORSER, "Endorser"),
  member(CANDIDATE, "Candidate"),
]

beforeEach(() => vi.clearAllMocks())

describe("AskToEndorsePicker", () => {
  it("excludes the author and existing endorsers from the candidate list", async () => {
    vi.mocked(getTripCrew).mockResolvedValue(CREW)
    render(
      <AskToEndorsePicker
        logId={LOG_ID}
        tripId={TRIP_ID}
        authorId={AUTHOR}
        endorserIds={[ENDORSER]}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /ask to endorse/i }))
    expect(await screen.findByText("Candidate")).toBeDefined()
    expect(screen.queryByText("Author")).toBeNull()
    expect(screen.queryByText("Endorser")).toBeNull()
  })

  it("sends an endorsement request for the chosen trip-mate", async () => {
    vi.mocked(getTripCrew).mockResolvedValue(CREW)
    vi.mocked(requestEndorsement).mockResolvedValue({ success: true })
    render(
      <AskToEndorsePicker logId={LOG_ID} tripId={TRIP_ID} authorId={AUTHOR} endorserIds={[]} />,
    )

    await userEvent.click(screen.getByRole("button", { name: /ask to endorse/i }))
    await userEvent.click(await screen.findByText("Candidate"))
    await waitFor(() =>
      expect(requestEndorsement).toHaveBeenCalledWith(LOG_ID, { userId: CANDIDATE }),
    )
  })
})
