import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockAdd, mockToggle, mockRemove, mockRefresh } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockToggle: vi.fn(),
  mockRemove: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/inventory/personal-packing-actions", () => ({
  addPackingItem: mockAdd,
  togglePackingItem: mockToggle,
  removePackingItem: mockRemove,
}))

import { PersonalPacking } from "../personal-packing"
import type { Item } from "@/lib/dtos/item"
import type { PersonalPackingItem } from "@/lib/dtos/personal-packing"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000d01"
const ENTRY_ID = "01952f1a-0000-7000-8000-000000000p01"

const PACKED_ITEM: Item = {
  id: "01952f1a-0000-7000-8000-000000000a01",
  name: "Drysuit",
  status: "owned",
}
const UNPACKED_OWNED: Item = {
  id: "01952f1a-0000-7000-8000-000000000a02",
  name: "Thermos",
  status: "owned",
}
const SUGGESTED: Item = {
  id: "01952f1a-0000-7000-8000-000000000a03",
  name: "Maybe map",
  status: "suggested",
}

const ENTRIES: PersonalPackingItem[] = [{ id: ENTRY_ID, checked: false, item: PACKED_ITEM }]

function renderKit(overrides: Partial<React.ComponentProps<typeof PersonalPacking>> = {}) {
  return render(
    <PersonalPacking
      tripId={TRIP_ID}
      packingItems={ENTRIES}
      myItems={[PACKED_ITEM, UNPACKED_OWNED, SUGGESTED]}
      {...overrides}
    />,
  )
}

describe("PersonalPacking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAdd.mockResolvedValue({ success: true })
    mockToggle.mockResolvedValue({ success: true })
    mockRemove.mockResolvedValue({ success: true })
  })

  it("lists the current packing entries", () => {
    renderKit()
    expect(screen.getByText("Drysuit")).toBeTruthy()
  })

  it("offers only owned gear not already on the list", () => {
    renderKit()
    expect(screen.getByRole("option", { name: "Thermos" })).toBeTruthy()
    expect(screen.queryByRole("option", { name: "Drysuit" })).toBeNull() // already packed
    expect(screen.queryByRole("option", { name: "Maybe map" })).toBeNull() // suggested, not owned
  })

  it("adds an owned item to the kit", async () => {
    const user = userEvent.setup()
    renderKit()
    await user.selectOptions(screen.getByLabelText(/add to your kit/i), UNPACKED_OWNED.id!)
    expect(mockAdd).toHaveBeenCalledWith(TRIP_ID, UNPACKED_OWNED.id)
  })

  it("toggles the packed flag on an entry", async () => {
    const user = userEvent.setup()
    renderKit()
    await user.click(screen.getByRole("checkbox", { name: /drysuit/i }))
    expect(mockToggle).toHaveBeenCalledWith(ENTRY_ID, true, TRIP_ID)
  })

  it("removes an entry from the kit", async () => {
    const user = userEvent.setup()
    renderKit()
    await user.click(screen.getByRole("button", { name: /remove drysuit/i }))
    expect(mockRemove).toHaveBeenCalledWith(ENTRY_ID, TRIP_ID)
  })

  it("shows an empty state when nothing is packed", () => {
    renderKit({ packingItems: [] })
    expect(screen.getByText(/nothing in your kit yet/i)).toBeTruthy()
  })
})
