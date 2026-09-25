import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getKeypair: vi.fn(),
}))
vi.mock("@/lib/trip-member/actions", () => ({
  readMemberMedicalNotes: vi.fn(),
}))
// Mocked so these tests stay about the leader's read flow — unlock, fetch, decrypt, and
// what the leader is told when a step fails. The crypto itself is pinned by the
// cross-language vectors in lib/crypto/__tests__.
vi.mock("@/lib/crypto/medical", () => ({
  decrypt: vi.fn(),
  decryptAsRecipient: vi.fn(),
}))

import { reAuth, getKeypair } from "@/lib/profile/actions"
import { readMemberMedicalNotes } from "@/lib/trip-member/actions"
import { decrypt, decryptAsRecipient } from "@/lib/crypto/medical"
import { FloatPlanCrewManifest } from "../float-plan-crew-manifest"
import type { TripMember } from "@/lib/dtos/trip-member"
import { formatDayDate } from "@/lib/utils/date"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const MEMBER_ID = "01952f1a-0000-7000-8000-000000000002"
const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"
const PRIVATE_KEY = "cHJpdmF0ZQ=="
const NOTES = "Allergic to penicillin"

const KEYPAIR = {
  publicKey: "cGs=",
  privateKeyCiphertext: "c2s=",
  privateKeyNonce: "bm9uY2U=",
  privateKeySalt: "c2FsdA==",
}
const SEALED_FOR_LEADER = { ciphertext: "Y3Q=", nonce: "bm9uY2U=", ephemeralKey: "ZXBo" }

const CREW: TripMember[] = [
  {
    id: "01952f1a-0000-7000-8000-000000000010",
    role: "crew",
    user: { id: MEMBER_ID, mail: "ada@example.com", username: "ada", name: "Ada" },
    hasLeaderMedicalNotes: true,
  } as TripMember,
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
  vi.mocked(getKeypair).mockResolvedValue({ success: true, keypair: KEYPAIR })
  vi.mocked(decrypt).mockResolvedValue(PRIVATE_KEY)
  vi.mocked(readMemberMedicalNotes).mockResolvedValue({
    success: true,
    sealed: SEALED_FOR_LEADER,
  })
  vi.mocked(decryptAsRecipient).mockReturnValue(NOTES)
})

async function unlock(password = PASSWORD) {
  render(<FloatPlanCrewManifest crew={CREW} tripId={TRIP_ID} />)
  await userEvent.click(screen.getByRole("button", { name: /view/i }))
  await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), password)
  await userEvent.click(screen.getByRole("button", { name: /^view notes$/i }))
}

describe("FloatPlanCrewManifest — leader read path", () => {
  it("unwraps the leader's own private key and decrypts the member's notes locally", async () => {
    await unlock()

    await waitFor(() => expect(screen.getByText(NOTES)).toBeInTheDocument())
    // The elevated token is the only thing sent — the password stays in the browser and
    // the server hands back ciphertext it cannot read.
    expect(readMemberMedicalNotes).toHaveBeenCalledWith(TRIP_ID, MEMBER_ID, ELEVATED_TOKEN)
    expect(decrypt).toHaveBeenCalledWith(
      KEYPAIR.privateKeyCiphertext,
      KEYPAIR.privateKeyNonce,
      KEYPAIR.privateKeySalt,
      PASSWORD,
    )
    expect(decryptAsRecipient).toHaveBeenCalledWith(
      SEALED_FOR_LEADER.ciphertext,
      SEALED_FOR_LEADER.nonce,
      SEALED_FOR_LEADER.ephemeralKey,
      PRIVATE_KEY,
    )
  })

  it("tells the leader their key does not match, and fetches nothing", async () => {
    // reAuth accepted the password, so the wrapped key predates a password change that
    // never re-wrapped it. Asking the server for notes it cannot help with would only
    // write an access-log entry for a read that cannot succeed.
    vi.mocked(decrypt).mockRejectedValue(new Error("invalid tag"))
    await unlock()

    await waitFor(() => expect(screen.getByText(/does not match this password/i)).toBeDefined())
    expect(readMemberMedicalNotes).not.toHaveBeenCalled()
  })

  it("explains a copy sealed to a previous leader rather than failing silently", async () => {
    vi.mocked(decryptAsRecipient).mockImplementation(() => {
      throw new Error("invalid tag")
    })
    await unlock()

    await waitFor(() => expect(screen.getByText(/previous leader/i)).toBeDefined())
    expect(screen.queryByText(NOTES)).toBeNull()
  })

  it("surfaces a failed fetch against the member it failed for", async () => {
    vi.mocked(readMemberMedicalNotes).mockResolvedValue({
      success: false,
      error: "No shared notes for this member.",
    })
    await unlock()

    await waitFor(() => expect(screen.getByText(/no shared notes/i)).toBeDefined())
    expect(decryptAsRecipient).not.toHaveBeenCalled()
  })

  it("reports a missing keypair instead of prompting for the password again", async () => {
    vi.mocked(getKeypair).mockResolvedValue({
      success: false,
      error: "Set up medical note encryption first.",
    })
    await unlock()

    await waitFor(() => expect(screen.getByText(/set up medical note encryption/i)).toBeDefined())
    expect(readMemberMedicalNotes).not.toHaveBeenCalled()
  })
})

// M9d: the leader records a paddler leaving a trip under way; whoever reads the float
// plan must see who is no longer on the water, and since when.
describe("FloatPlanCrewManifest — departures", () => {
  it("says a paddler has left the trip, when, and why", () => {
    const leftAt = "2026-10-02T09:30:00Z"
    const departed = [{ ...CREW[0], leftAt, leftNote: "Evacuated from Cala Montjoi" } as TripMember]

    render(<FloatPlanCrewManifest crew={departed} tripId={TRIP_ID} />)

    expect(screen.getByText(`Left the trip on ${formatDayDate(leftAt)}`)).toBeDefined()
    expect(screen.getByText("Evacuated from Cala Montjoi")).toBeDefined()
  })

  it("says nothing about leaving for a paddler still on the trip", () => {
    render(<FloatPlanCrewManifest crew={CREW} tripId={TRIP_ID} />)

    expect(screen.queryByText(/Left the trip/)).toBeNull()
  })
})
