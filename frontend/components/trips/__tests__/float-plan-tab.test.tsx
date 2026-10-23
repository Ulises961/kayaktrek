import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
  shareMedicalNotes: vi.fn(),
  setSatelliteTracking: vi.fn(),
}))
vi.mock("@/lib/logistics/actions", () => ({
  upsertLogistics: vi.fn(),
  generateFloatPlanShare: vi.fn(),
  sendFloatPlanShareEmail: vi.fn(),
}))
vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
  grantMedicalConsent: vi.fn(),
  revokeMedicalConsent: vi.fn(),
}))

import { updateMyFloatPlan, setSatelliteTracking } from "@/lib/trip-member/actions"
import { upsertLogistics } from "@/lib/logistics/actions"
import { FloatPlanTab } from "../tabs/float-plan-tab"
import { TRIP_STATE } from "@/lib/dtos/trip"
import { formatDayDate } from "@/lib/utils/date"
import type { Logistics } from "@/lib/dtos/logistics"
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
  logistics: null,
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

  it("says when the plan was confirmed, and not before it was", () => {
    const { unmount } = render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    expect(screen.queryByText(/^confirmed/i)).toBeNull()
    unmount()

    const member = { ...BASE_MEMBER, floatPlanConfirmedAt: "2026-05-14T10:00:00" }
    render(<FloatPlanTab {...TAB_PROPS} currentMember={member} />)
    expect(screen.getByText(`Confirmed ${formatDayDate("2026-05-14")}`)).toBeInTheDocument()
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

  describe("the notice that it is off", () => {
    const NOTICE = /your position is not being shared/i
    const HAPPENING = { tripState: TRIP_STATE.HAPPENING }

    it("warns, in the inReach section, when a registered feed is off on a happening trip", () => {
      render(<FloatPlanTab {...TAB_PROPS} {...HAPPENING} currentMember={BASE_MEMBER} />)

      const section = screen.getByRole("region", { name: "inReach" })
      expect(within(section).getByText(NOTICE)).toBeInTheDocument()
      expect(within(section).getByRole("switch", { name: SWITCH_NAME })).toBeInTheDocument()
    })

    it("says nothing once the switch is on", () => {
      const member = { ...BASE_MEMBER, sharesSatellitePosition: true }
      render(<FloatPlanTab {...TAB_PROPS} {...HAPPENING} currentMember={member} />)

      expect(screen.queryByText(NOTICE)).toBeNull()
    })

    it("says nothing to a paddler with no feed registered: they cannot act on it", () => {
      render(
        <FloatPlanTab
          {...TAB_PROPS}
          {...HAPPENING}
          hasSatelliteFeed={false}
          currentMember={BASE_MEMBER}
        />,
      )

      expect(screen.queryByText(NOTICE)).toBeNull()
    })

    it("says nothing before the trip has started, when nothing is yet expected to be sharing", () => {
      render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)

      expect(screen.queryByText(NOTICE)).toBeNull()
    })
  })
})

describe("FloatPlanTab — the order of its sections", () => {
  // Each section is a row of the accordion, opened by a button named after it.
  function sectionTitles() {
    return screen
      .getAllByRole("button", { name: /^(safety and rescue information|your details|inreach)/i })
      .map((trigger) => trigger.textContent)
  }

  it("puts safety and rescue information first, then the member's details, then inReach", () => {
    render(<FloatPlanTab {...TAB_PROPS} isLeader currentMember={BASE_MEMBER} />)

    expect(sectionTitles()).toEqual([
      expect.stringMatching(/^Safety and rescue information/),
      expect.stringMatching(/^Your details/),
      "inReach",
    ])
  })

  it("starts with the member's details first for crew, who have no safety section", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)

    expect(sectionTitles()).toEqual([expect.stringMatching(/^Your details/), "inReach"])
  })

  it("keeps the member's details and inReach open and the safety section folded", () => {
    render(<FloatPlanTab {...TAB_PROPS} isLeader currentMember={BASE_MEMBER} />)

    const [safety, details, inReach] = screen.getAllByRole("button", {
      name: /^(safety and rescue information|your details|inreach)/i,
    })
    expect(safety).toHaveAttribute("aria-expanded", "false")
    expect(details).toHaveAttribute("aria-expanded", "true")
    expect(inReach).toHaveAttribute("aria-expanded", "true")
  })

  it("folds the member's details away and brings them back", async () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)
    const details = screen.getByRole("button", { name: /^your details/i })

    await userEvent.click(details)
    expect(screen.queryByText("Wilderness Systems Tempest 170")).toBeNull()

    await userEvent.click(details)
    expect(screen.getByText("Wilderness Systems Tempest 170")).toBeInTheDocument()
  })
})

describe("FloatPlanTab — the safety and rescue side, which is the leader's", () => {
  const SAFETY = /^safety and rescue information/i
  const LOGISTICS: Logistics = {
    id: "01952f1a-0000-7000-8000-000000000050",
    shoreContactName: "Marguerite Vandersteen",
    shoreContactEmail: "marguerite@harbourwatch.example.com",
    shoreContactPhone: "+39 011 555 0142",
    shoreContactRelationship: "Harbour master",
    shareToken: null,
  }

  function renderForLeader(logistics: Logistics | null = LOGISTICS) {
    render(
      <FloatPlanTab {...TAB_PROPS} isLeader logistics={logistics} currentMember={BASE_MEMBER} />,
    )
  }

  async function openShore() {
    await userEvent.click(screen.getByRole("button", { name: SAFETY }))
  }

  it("starts folded, with a line saying where the shore side stands", () => {
    renderForLeader()

    expect(screen.getByRole("button", { name: SAFETY })).toHaveTextContent(
      "Marguerite Vandersteen, no link yet",
    )
    expect(screen.queryByRole("region", { name: "Shore contact" })).toBeNull()
  })

  it("says so when there is no contact yet, and when the link is live", () => {
    const { unmount } = render(
      <FloatPlanTab {...TAB_PROPS} isLeader logistics={null} currentMember={BASE_MEMBER} />,
    )
    expect(screen.getByRole("button", { name: SAFETY })).toHaveTextContent(
      "No shore contact yet, no link yet",
    )
    unmount()

    renderForLeader({ ...LOGISTICS, shareToken: "tok_live" })
    expect(screen.getByRole("button", { name: SAFETY })).toHaveTextContent(
      "Marguerite Vandersteen, link live",
    )
  })

  it("shows the leader the shore contact as saved, once opened", async () => {
    renderForLeader()
    await openShore()

    const shore = screen.getByRole("region", { name: "Shore contact" })
    expect(within(shore).getByText("Marguerite Vandersteen")).toBeInTheDocument()
    expect(within(shore).getByText("marguerite@harbourwatch.example.com")).toBeInTheDocument()
  })

  it("lets the leader save a shore contact from here", async () => {
    vi.mocked(upsertLogistics).mockResolvedValue({ success: true })
    renderForLeader(null)
    await openShore()

    const shore = screen.getByRole("region", { name: "Shore contact" })
    await userEvent.click(within(shore).getByRole("button", { name: "Edit" }))
    await userEvent.type(within(shore).getByLabelText("Name"), "Alice Shore")
    await userEvent.click(within(shore).getByRole("button", { name: "Save" }))

    await waitFor(() =>
      expect(upsertLogistics).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ shoreContactName: "Alice Shore" }),
      ),
    )
    expect(await within(shore).findByText("Alice Shore")).toBeInTheDocument()
  })

  it("lets the leader generate the share link", async () => {
    renderForLeader(null)
    await openShore()

    const share = screen.getByRole("region", { name: "Share and print" })
    expect(
      within(share).getByRole("button", { name: /generate float plan link/i }),
    ).toBeInTheDocument()
  })

  it("links the leader to the printable float plan", async () => {
    renderForLeader()
    await openShore()

    expect(screen.getByRole("link", { name: /printable float plan/i })).toHaveAttribute(
      "href",
      `/trips/float-plan/${TRIP_ID}`,
    )
  })

  it("shows crew none of it: the shore contact, the link and the print page are the leader's", () => {
    render(<FloatPlanTab {...TAB_PROPS} currentMember={BASE_MEMBER} />)

    expect(screen.queryByRole("button", { name: SAFETY })).toBeNull()
    expect(screen.queryByRole("region", { name: "Shore contact" })).toBeNull()
    expect(screen.queryByRole("link", { name: /printable float plan/i })).toBeNull()
  })

  it("keeps the leader's own vessel and emergency contact, which every member has", () => {
    renderForLeader()

    expect(screen.getByText("Wilderness Systems Tempest 170")).toBeInTheDocument()
    expect(screen.getByText("Bob Smith")).toBeInTheDocument()
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
