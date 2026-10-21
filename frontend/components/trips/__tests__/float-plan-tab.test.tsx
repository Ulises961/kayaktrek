import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
  shareMedicalNotes: vi.fn(),
  setSatelliteTracking: vi.fn(),
}))
vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
  grantMedicalConsent: vi.fn(),
  revokeMedicalConsent: vi.fn(),
}))

import { updateMyFloatPlan, setSatelliteTracking } from "@/lib/trip-member/actions"
import { FloatPlanTab } from "../tabs/float-plan-tab"
import { TRIP_STATE } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const BASE_MEMBER: TripMember = {
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

const TAB_PROPS = {
  tripId: TRIP_ID,
  tripState: TRIP_STATE.BUILDING,
  hasSatelliteFeed: true,
  isLeader: false,
}

beforeEach(() => vi.clearAllMocks())

describe("FloatPlanTab — viewing state", () => {
  it("shows amber banner when floatPlanConfirmedAt is null", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.getByText(/review.*float plan/i)).toBeDefined()
  })

  it("does not show amber banner when floatPlanConfirmedAt is set", () => {
    const member = { ...BASE_MEMBER, floatPlanConfirmedAt: "2026-05-14T10:00:00" }
    render(<FloatPlanTab {...TAB_PROPS} currentMember={member} />)
    expect(screen.queryByText(/review.*float plan/i)).toBeNull()
  })

  it("shows vessel make and model in read-only view", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.getByText("Wilderness Systems Tempest 170")).toBeDefined()
  })

  it("shows emergency contact name in read-only view", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.getByText("Bob Smith")).toBeDefined()
  })

  it("does not show form inputs by default", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.queryByLabelText(/make/i)).toBeNull()
  })

  it("shows an Edit button", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
  })
})

describe("FloatPlanTab — the same member changing it on another device (M36)", () => {
  it("drops the review banner once the server says the plan was confirmed elsewhere", () => {
    const { rerender } = render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.getByText(/review.*float plan/i)).toBeDefined()

    rerender(
      <FloatPlanTab
        {...TAB_PROPS}
        currentMember={{ ...BASE_MEMBER, floatPlanConfirmedAt: "2026-05-14T10:00:00" }}
      />,
    )

    expect(screen.queryByText(/review.*float plan/i)).toBeNull()
  })

  it("opens the form on what the server has now, not on what the page loaded with", async () => {
    const { rerender } = render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)

    rerender(
      <FloatPlanTab {...TAB_PROPS} currentMember={{ ...BASE_MEMBER, vesselMake: "Valley" }} />,
    )
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))

    expect((screen.getByLabelText(/make/i) as HTMLInputElement).value).toBe("Valley")
  })
})

describe("FloatPlanTab — inReach tracking (M29)", () => {
  const SWITCH_NAME = /share my inreach on this trip/i

  it.each([TRIP_STATE.BUILDING, TRIP_STATE.HAPPENING])(
    "offers the switch while the trip is %s",
    (tripState) => {
      render(<FloatPlanTab {...TAB_PROPS} tripState={tripState} currentMember={BASE_MEMBER} />)

      expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeInTheDocument()
    },
  )

  it.each([TRIP_STATE.PAST, null, undefined])(
    "offers no switch when the trip is %s",
    (tripState) => {
      render(<FloatPlanTab {...TAB_PROPS} tripState={tripState} currentMember={BASE_MEMBER} />)

      expect(screen.queryByRole("switch", { name: SWITCH_NAME })).toBeNull()
      expect(screen.queryByText(/inreach/i)).toBeNull()
    },
  )

  it("offers no switch to a member who has left the trip", () => {
    const member = { ...BASE_MEMBER, leftAt: "2026-10-02T09:30:00" }
    render(<FloatPlanTab {...TAB_PROPS} tripState={TRIP_STATE.HAPPENING} currentMember={member} />)

    expect(screen.queryByRole("switch", { name: SWITCH_NAME })).toBeNull()
  })

  it("shows the switch on when the member has it on, and off when the field is absent", () => {
    const { rerender } = render(
      <FloatPlanTab
        {...TAB_PROPS}
        currentMember={{ ...BASE_MEMBER, sharesSatellitePosition: true }}
      />,
    )
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
      "aria-checked",
      "true",
    )

    rerender(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toHaveAttribute(
      "aria-checked",
      "false",
    )
  })

  it("cannot be switched on without a registered feed", () => {
    render(<FloatPlanTab {...TAB_PROPS} hasSatelliteFeed={false} currentMember={BASE_MEMBER} />)

    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeDisabled()
  })

  it("switches the feed on for this trip once the consent is confirmed", async () => {
    vi.mocked(setSatelliteTracking).mockResolvedValue({ success: true })
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)

    await userEvent.click(screen.getByRole("switch", { name: SWITCH_NAME }))
    expect(setSatelliteTracking).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))

    expect(setSatelliteTracking).toHaveBeenCalledWith(TRIP_ID, true)
  })
})

describe("FloatPlanTab — the printable float plan", () => {
  it("links the leader to it", () => {
    render(<FloatPlanTab {...TAB_PROPS} isLeader currentMember={BASE_MEMBER} />)

    expect(screen.getByRole("link", { name: /printable float plan/i })).toHaveAttribute(
      "href",
      `/trips/float-plan/${TRIP_ID}`,
    )
  })

  it("does not offer it to crew: the page itself is the leader's", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)

    expect(screen.queryByRole("link", { name: /printable float plan/i })).toBeNull()
  })
})

describe("FloatPlanTab — editing state", () => {
  it("shows form inputs after clicking Edit", async () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText(/make/i)).toBeDefined()
    expect((screen.getByLabelText(/make/i) as HTMLInputElement).value).toBe("Wilderness Systems")
  })

  it("returns to read-only on Cancel", async () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.queryByLabelText(/make/i)).toBeNull()
    expect(screen.getByText("Wilderness Systems Tempest 170")).toBeDefined()
  })

  it("calls updateMyFloatPlan and returns to read-only on Save", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: true })
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /save float plan/i }))
    await waitFor(() =>
      expect(updateMyFloatPlan).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ vesselMake: "Wilderness Systems" }),
      ),
    )
    await waitFor(() => expect(screen.queryByLabelText(/make/i)).toBeNull())
  })

  it("shows error and stays in editing on save failure", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({
      success: false,
      error: "Failed to update float plan.",
    })
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /save float plan/i }))
    await waitFor(() => expect(screen.getByText("Failed to update float plan.")).toBeDefined())
    expect(screen.getByLabelText(/make/i)).toBeDefined()
  })
})
