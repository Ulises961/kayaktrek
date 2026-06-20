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
const REQ_NEEDED = "01952f1a-0000-7000-8000-000000000b01"
const REQ_COVERED = "01952f1a-0000-7000-8000-000000000b02"
const ITEM_ID = "01952f1a-0000-7000-8000-000000000a01"

const OWNED_ITEM: Item = {
  id: ITEM_ID,
  name: "Bilge pump",
  status: "owned",
}

const SUGGESTED_ITEM: Item = {
  id: "01952f1a-0000-7000-8000-000000000a02",
  name: "Spare paddle",
  status: "suggested",
}

const REQUIREMENTS: TripRequirement[] = [
  { id: REQ_NEEDED, name: "Tow line", status: "needed", checked: false },
  {
    id: REQ_COVERED,
    name: "Bilge pump",
    status: "covered",
    checked: false,
    coveringItem: OWNED_ITEM,
    contributors: [{ id: "u1", username: "pat", name: "Pat" }],
  },
]

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
    expect(screen.getAllByText("Bilge pump").length).toBeGreaterThan(0)
    expect(screen.getByText(/needed/i)).toBeTruthy()
    expect(screen.getByText(/covered/i)).toBeTruthy()
  })

  it("shows the contributor on a covered requirement", () => {
    renderChecklist()
    expect(screen.getByText(/pat/i)).toBeTruthy()
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

  it("only offers owned items in the contribute picker", () => {
    renderChecklist()
    // The needed requirement exposes a picker; suggested gear must not appear.
    expect(screen.getByRole("option", { name: "Bilge pump" })).toBeTruthy()
    expect(screen.queryByRole("option", { name: "Spare paddle" })).toBeNull()
  })

  it("contributes an owned item to a needed requirement", async () => {
    const user = userEvent.setup()
    renderChecklist()

    await user.selectOptions(screen.getByLabelText(/contribute to tow line/i), ITEM_ID)

    expect(mockContributeItem).toHaveBeenCalledWith(INVENTORY_ID, REQ_NEEDED, ITEM_ID, TRIP_ID)
  })

  it("withdraws a contribution from a covered requirement", async () => {
    const user = userEvent.setup()
    renderChecklist()

    await user.click(screen.getByRole("button", { name: /withdraw/i }))

    expect(mockUnclaimRequirement).toHaveBeenCalledWith(INVENTORY_ID, REQ_COVERED, TRIP_ID)
  })

  it("removes a requirement after confirmation", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    renderChecklist()

    await user.click(screen.getByRole("button", { name: /remove tow line/i }))

    expect(mockRemoveRequirement).toHaveBeenCalledWith(INVENTORY_ID, REQ_NEEDED, TRIP_ID)
  })
})
