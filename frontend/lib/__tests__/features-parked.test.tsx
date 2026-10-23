/**
 * Medical notes parked (2026-09-02) — the flag-off half of the feature's coverage.
 *
 * `vitest.config.ts` forces `NEXT_PUBLIC_MEDICAL_NOTES` on for the rest of the suite, so
 * that parking the feature does not quietly stop testing it. This file is the opposite
 * case: with the flag off, every surface that offers to collect or read medical notes has
 * to be gone from the page — not merely disabled, since a disabled control still tells a
 * visitor the app wants their health data.
 *
 * `lib/features` is mocked rather than the env stubbed, because `MEDICAL_NOTES_ENABLED`
 * is read once at module evaluation — `vi.stubEnv` after the import would change nothing.
 *
 * See `backend/Tests/81_medical_notes_parked_test.py` for the server half.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/lib/features", () => ({ MEDICAL_NOTES_ENABLED: false }))

vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
  setSatelliteTracking: vi.fn(),
  shareMedicalNotes: vi.fn(),
  readMemberMedicalNotes: vi.fn(),
}))
vi.mock("@/lib/logistics/actions", () => ({
  upsertLogistics: vi.fn(),
  generateFloatPlanShare: vi.fn(),
  sendFloatPlanShareEmail: vi.fn(),
}))
vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getKeypair: vi.fn(),
  storeKeypair: vi.fn(),
  getMedicalNotes: vi.fn(),
  grantMedicalConsent: vi.fn(),
  revokeMedicalConsent: vi.fn(),
}))
vi.mock("@/lib/crypto/medical", () => ({
  decrypt: vi.fn(),
  decryptAsRecipient: vi.fn(),
  generateKeypair: vi.fn(),
}))

import { FloatPlanTab } from "@/components/trips/tabs/float-plan-tab"
import { FloatPlanCrewManifest } from "@/components/trips/float-plan-crew-manifest"
import { KeypairPromptBanner } from "@/components/common/keypair-prompt-banner"
import { TRIP_STATE } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const MEMBER_ID = "01952f1a-0000-7000-8000-000000000002"

const MEMBER: TripMember = {
  id: "01952f1a-0000-7000-8000-000000000010",
  role: "crew",
  user: {
    id: "01952f1a-0000-7000-8000-000000000001",
    mail: "ada@example.com",
    username: "ada",
    name: "Ada",
  },
  vesselMake: "Wilderness Systems",
  vesselModel: "Tempest 170",
  vesselLengthCm: 520,
  vesselColorPrimary: "Red",
  vesselColorSecondary: "White",
  emergencyContactName: "Bob Smith",
  emergencyContactPhone: "+1555555555",
  emergencyContactRelationship: "Partner",
  medicalNotesConsentAt: null,
  floatPlanConfirmedAt: null,
}

// Deliberately "has notes, has shared them, was reset" — the flag has to win over every
// piece of state that would otherwise make a medical control appear.
const MEMBER_WITH_NOTES: TripMember = {
  ...MEMBER,
  hasTripMedicalNotes: true,
  medicalNotesConsentAt: "2026-08-01T10:00:00",
} as TripMember

const CREW: TripMember[] = [
  {
    id: "01952f1a-0000-7000-8000-000000000011",
    role: "crew",
    user: { id: MEMBER_ID, mail: "ada@example.com", username: "ada", name: "Ada" },
    hasLeaderMedicalNotes: true,
  } as TripMember,
]

beforeEach(() => vi.clearAllMocks())

describe("float plan tab, medical notes parked", () => {
  it("offers no way to enter medical notes", () => {
    render(
      <FloatPlanTab
        tripId={TRIP_ID}
        tripState={TRIP_STATE.BUILDING}
        currentMember={MEMBER_WITH_NOTES}
        hasSatelliteFeed
        isLeader
        logistics={null}
        medicalNotesResetAt="2026-08-20T10:00:00"
      />,
    )

    expect(screen.queryByText(/medical/i)).toBeNull()
  })

  it("still renders the rest of the float plan", () => {
    render(
      <FloatPlanTab
        tripId={TRIP_ID}
        tripState={TRIP_STATE.BUILDING}
        currentMember={MEMBER_WITH_NOTES}
        hasSatelliteFeed
        isLeader
        logistics={null}
      />,
    )

    expect(screen.getByText("Wilderness Systems Tempest 170")).toBeDefined()
    expect(screen.getByText("Bob Smith")).toBeDefined()
  })
})

describe("crew manifest, medical notes parked", () => {
  it("offers the leader no way to read a crew member's notes", () => {
    render(<FloatPlanCrewManifest tripId={TRIP_ID} crew={CREW} />)

    expect(screen.queryByText(/medical/i)).toBeNull()
  })

  it("still renders the crew member", () => {
    render(<FloatPlanCrewManifest tripId={TRIP_ID} crew={CREW} />)

    expect(screen.getByText("Ada")).toBeDefined()
  })
})

describe("keypair prompt, medical notes parked", () => {
  it("does not nag an account with no keypair", () => {
    const { container } = render(<KeypairPromptBanner hasKeypair={false} />)

    expect(container).toBeEmptyDOMElement()
  })
})
