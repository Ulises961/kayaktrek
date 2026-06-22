import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const {
  mockAddRequirement,
  mockRemoveRequirement,
  mockContributeItem,
  mockUnclaimRequirement,
  mockRefresh,
} = vi.hoisted(() => ({
  mockAddRequirement: vi.fn(),
  mockRemoveRequirement: vi.fn(),
  mockContributeItem: vi.fn(),
  mockUnclaimRequirement: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/inventory/actions", () => ({
  addRequirement: mockAddRequirement,
  removeRequirement: mockRemoveRequirement,
  contributeItem: mockContributeItem,
  unclaimRequirement: mockUnclaimRequirement,
}))

import { RequirementsChecklist } from "../requirements-checklist"
import type { TripRequirement } from "@/lib/dtos/inventory"
import type { Item } from "@/lib/dtos/item"

const INVENTORY_ID = "01952f1a-0000-7000-8000-000000000c01"
const TRIP_ID = "01952f1a-0000-7000-8000-000000000d01"
const REQ_MINE = "01952f1a-0000-7000-8000-000000000b01"
const REQ_OTHERS = "01952f1a-0000-7000-8000-000000000b02"
const REQ_COVERED_BY_ME = "01952f1a-0000-7000-8000-000000000b03"
const ITEM_ID = "01952f1a-0000-7000-8000-000000000a01"

const ME = "01952f1a-0000-7000-8000-000000000e01"
const OTHER = "01952f1a-0000-7000-8000-000000000e02"

const ME_MEMBER = { id: "m-me", user: { id: ME, username: "me", name: "Mia" } }
const OTHER_MEMBER = { id: "m-other", user: { id: OTHER, username: "ozzy", name: "Ozzy" } }

const OWNED_ITEM: Item = { id: ITEM_ID, name: "Bilge pump", status: "owned" }
const SUGGESTED_ITEM: Item = {
  id: "01952f1a-0000-7000-8000-000000000a02",
  name: "Spare paddle",
  status: "suggested",
}

// Proposed by me, uncovered → I may remove it and contribute to it.
const REQ_PROPOSED_BY_ME: TripRequirement = {
  id: REQ_MINE,
  name: "Tow line",
  status: "needed",
  proposedBy: ME_MEMBER,
  contributions: [],
}

// Proposed by someone else, covered by them → I cannot remove or withdraw,
// but I may still contribute a second one.
const REQ_PROPOSED_BY_OTHER: TripRequirement = {
  id: REQ_OTHERS,
  name: "First aid kit",
  status: "covered",
  proposedBy: OTHER_MEMBER,
  contributions: [
    { id: "c1", member: OTHER_MEMBER, item: { id: "x", name: "Trauma kit" }, checked: false },
  ],
}

// Covered by me → I may withdraw my own contribution.
const REQ_COVERED_BY_ME_FIXTURE: TripRequirement = {
  id: REQ_COVERED_BY_ME,
  name: "Bilge pump",
  status: "covered",
  proposedBy: OTHER_MEMBER,
  contributions: [
    { id: "c2", member: ME_MEMBER, item: { id: ITEM_ID, name: "Bilge pump" }, checked: false },
  ],
}

const REQUIREMENTS = [REQ_PROPOSED_BY_ME, REQ_PROPOSED_BY_OTHER, REQ_COVERED_BY_ME_FIXTURE]

function renderChecklist(
  overrides: Partial<React.ComponentProps<typeof RequirementsChecklist>> = {},
) {
  return render(
    <RequirementsChecklist
      inventoryId={INVENTORY_ID}
      tripId={TRIP_ID}
      requirements={REQUIREMENTS}
      myItems={[OWNED_ITEM, SUGGESTED_ITEM]}
      canManage={true}
      currentUserId={ME}
      {...overrides}
    />,
  )
}

describe("RequirementsChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddRequirement.mockResolvedValue({ success: true })
    mockRemoveRequirement.mockResolvedValue({ success: true })
    mockContributeItem.mockResolvedValue({ success: true })
    mockUnclaimRequirement.mockResolvedValue({ success: true })
  })

  it("renders each requirement with its status", () => {
    renderChecklist()
    expect(screen.getByText("Tow line")).toBeTruthy()
    expect(screen.getByText("First aid kit")).toBeTruthy()
    expect(screen.getAllByText(/needed/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/covered/i).length).toBeGreaterThan(0)
  })

  it("shows every contribution with its contributor", () => {
    renderChecklist()
    // Other member's contribution on a requirement I didn't propose.
    expect(screen.getByText(/Trauma kit/)).toBeTruthy()
    expect(screen.getByText(/Ozzy/)).toBeTruthy()
  })

  it("shows Remove only on requirements the current user proposed", () => {
    renderChecklist()
    expect(screen.queryByRole("button", { name: /remove tow line/i })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /remove first aid kit/i })).toBeNull()
  })

  it("shows Withdraw only on the current user's own contribution", () => {
    renderChecklist()
    // Exactly one Withdraw — on REQ_COVERED_BY_ME, not on the other-covered req.
    expect(screen.getAllByRole("button", { name: /withdraw/i })).toHaveLength(1)
  })

  it("offers a contribute picker when the user has not contributed yet", () => {
    renderChecklist()
    // Uncovered-by-me requirements expose a picker; the one I already cover does not.
    expect(screen.getByLabelText(/contribute to tow line/i)).toBeTruthy()
    expect(screen.getByLabelText(/contribute to first aid kit/i)).toBeTruthy()
    expect(screen.queryByLabelText(/contribute to bilge pump/i)).toBeNull()
  })

  it("only offers owned items in the contribute picker", () => {
    renderChecklist()
    expect(screen.getAllByRole("option", { name: "Bilge pump" }).length).toBeGreaterThan(0)
    expect(screen.queryByRole("option", { name: "Spare paddle" })).toBeNull()
  })

  it("contributes an owned item to a requirement", async () => {
    const user = userEvent.setup()
    renderChecklist()
    await user.selectOptions(screen.getByLabelText(/contribute to tow line/i), ITEM_ID)
    expect(mockContributeItem).toHaveBeenCalledWith(INVENTORY_ID, REQ_MINE, ITEM_ID, TRIP_ID)
  })

  it("withdraws the current user's own contribution", async () => {
    const user = userEvent.setup()
    renderChecklist()
    await user.click(screen.getByRole("button", { name: /withdraw/i }))
    expect(mockUnclaimRequirement).toHaveBeenCalledWith(INVENTORY_ID, REQ_COVERED_BY_ME, TRIP_ID)
  })

  it("removes a proposed requirement after confirmation", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    renderChecklist()
    await user.click(screen.getByRole("button", { name: /remove tow line/i }))
    expect(mockRemoveRequirement).toHaveBeenCalledWith(INVENTORY_ID, REQ_MINE, TRIP_ID)
  })

  it("adds a requirement from the inline form", async () => {
    const user = userEvent.setup()
    renderChecklist()
    await user.type(screen.getByPlaceholderText(/add a requirement/i), "Flares")
    await user.click(screen.getByRole("button", { name: /^add$/i }))
    expect(mockAddRequirement).toHaveBeenCalledWith(
      INVENTORY_ID,
      expect.objectContaining({ name: "Flares" }),
      TRIP_ID,
    )
  })

  it("hides management controls when the user cannot manage", () => {
    renderChecklist({ canManage: false })
    expect(screen.queryByPlaceholderText(/add a requirement/i)).toBeNull()
  })
})
