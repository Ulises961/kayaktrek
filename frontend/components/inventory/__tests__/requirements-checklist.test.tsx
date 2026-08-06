import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
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
const LIFE_JACKET_ID = "01952f1a-0000-7000-8000-000000000a03"

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
// Owned but not yet contributed to anything — the one item that should remain
// offered in every open requirement's picker.
const OWNED_ITEM_2: Item = {
  id: LIFE_JACKET_ID,
  name: "Life jacket",
  status: "owned",
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
      myItems={[OWNED_ITEM, OWNED_ITEM_2, SUGGESTED_ITEM]}
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

  it("shows every contribution as a stacked contributor avatar plus item name", () => {
    renderChecklist()
    // Other member's contribution on a requirement I didn't propose: the item
    // name stays visible text, the contributor rides the avatar's tooltip
    // (M12 §P — LogCard's endorser-stack idiom).
    expect(screen.getByText(/Trauma kit/)).toBeTruthy()
    expect(screen.getByTitle(/Ozzy — Trauma kit/)).toBeTruthy()
  })

  it("groups by trimmed, case-folded free-text category with a trailing Uncategorised bucket", () => {
    renderChecklist({
      requirements: [
        { ...REQ_PROPOSED_BY_ME, category: "Safety" },
        { ...REQ_PROPOSED_BY_OTHER, category: " safety " },
        REQ_COVERED_BY_ME_FIXTURE, // null category — must not be silently dropped
      ],
    })
    const labels = screen
      .getAllByText(/^(safety|uncategorised)$/i)
      .filter((el) => el.tagName === "P")
    expect(labels.map((el) => el.textContent)).toEqual(["Safety", "Uncategorised"])
    // The whitespace-cased duplicate landed in the first-seen-cased bucket.
    expect(screen.getByText("First aid kit")).toBeTruthy()
    // Requirement name + its contribution's item name both render.
    expect(screen.getAllByText("Bilge pump").length).toBeGreaterThan(0)
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
    expect(screen.getAllByRole("option", { name: "Life jacket" }).length).toBeGreaterThan(0)
    expect(screen.queryByRole("option", { name: "Spare paddle" })).toBeNull()
  })

  it("contributes an owned item to a requirement", async () => {
    const user = userEvent.setup()
    renderChecklist()
    await user.selectOptions(screen.getByLabelText(/contribute to tow line/i), LIFE_JACKET_ID)
    expect(mockContributeItem).toHaveBeenCalledWith(INVENTORY_ID, REQ_MINE, LIFE_JACKET_ID, TRIP_ID)
  })

  it("withdraws the current user's own contribution", async () => {
    const user = userEvent.setup()
    renderChecklist()
    await user.click(screen.getByRole("button", { name: /withdraw/i }))
    expect(mockUnclaimRequirement).toHaveBeenCalledWith(INVENTORY_ID, REQ_COVERED_BY_ME, TRIP_ID)
  })

  it("removes a proposed requirement after confirming in the dialog", async () => {
    const user = userEvent.setup()
    renderChecklist()
    await user.click(screen.getByRole("button", { name: /remove tow line/i }))
    await user.click(screen.getByRole("button", { name: /^remove$/i }))
    expect(mockRemoveRequirement).toHaveBeenCalledWith(INVENTORY_ID, REQ_MINE, TRIP_ID)
  })

  it("does not remove a requirement when the dialog is cancelled", async () => {
    const user = userEvent.setup()
    renderChecklist()
    await user.click(screen.getByRole("button", { name: /remove tow line/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(mockRemoveRequirement).not.toHaveBeenCalled()
  })

  it("excludes an item the user already contributed to another requirement from the picker", () => {
    // I've already contributed the bilge pump to REQ_COVERED_BY_ME — it should
    // not also be offered as an option for the still-open Tow line requirement.
    renderChecklist()
    const picker = screen.getByLabelText(/contribute to tow line/i)
    expect(within(picker).queryByRole("option", { name: "Bilge pump" })).toBeNull()
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

  it("displays an error when adding a requirement fails", async () => {
    const user = userEvent.setup()
    mockAddRequirement.mockResolvedValueOnce({
      success: false,
      error: "Requirement name too long",
    })
    renderChecklist()

    await user.type(screen.getByPlaceholderText(/add a requirement/i), "Flares")
    await user.click(screen.getByRole("button", { name: /^add$/i }))

    expect(screen.getByText("Requirement name too long")).toBeTruthy()
  })

  it("displays an error when removing a requirement fails", async () => {
    const user = userEvent.setup()
    mockRemoveRequirement.mockResolvedValueOnce({
      success: false,
      error: "Cannot remove covered requirement",
    })
    renderChecklist()

    await user.click(screen.getByRole("button", { name: /remove tow line/i }))
    await user.click(screen.getByRole("button", { name: /^remove$/i }))

    expect(screen.getByText("Cannot remove covered requirement")).toBeTruthy()
  })

  it("displays an error when contributing an item fails", async () => {
    const user = userEvent.setup()
    mockContributeItem.mockResolvedValueOnce({
      success: false,
      error: "Item already contributed elsewhere",
    })
    renderChecklist()

    await user.selectOptions(screen.getByLabelText(/contribute to tow line/i), LIFE_JACKET_ID)

    expect(screen.getByText("Item already contributed elsewhere")).toBeTruthy()
  })

  it("displays an error when withdrawing a contribution fails", async () => {
    const user = userEvent.setup()
    mockUnclaimRequirement.mockResolvedValueOnce({
      success: false,
      error: "Cannot withdraw from completed requirement",
    })
    renderChecklist()

    await user.click(screen.getByRole("button", { name: /withdraw/i }))

    expect(screen.getByText("Cannot withdraw from completed requirement")).toBeTruthy()
  })
})
