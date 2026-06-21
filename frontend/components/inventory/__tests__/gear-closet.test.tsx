import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockCreateItem, mockRefresh } = vi.hoisted(() => ({
  mockCreateItem: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/inventory/actions", () => ({
  createItem: mockCreateItem,
}))

import { GearCloset } from "../gear-closet"
import type { Item } from "@/lib/dtos/item"
import type { ItemCategory } from "@/lib/dtos/item-category"

const FIRST_AID: ItemCategory = {
  id: "01952f1a-0000-7000-8000-0000000000c1",
  slug: "first_aid",
  name: "First aid",
}
const CAMPING: ItemCategory = {
  id: "01952f1a-0000-7000-8000-0000000000c2",
  slug: "camping",
  name: "Camping",
}
const CATEGORIES = [FIRST_AID, CAMPING]

const ITEMS: Item[] = [
  {
    id: "01952f1a-0000-7000-8000-000000000a01",
    name: "Bilge pump",
    status: "owned",
    category: FIRST_AID,
  },
  {
    id: "01952f1a-0000-7000-8000-000000000a02",
    name: "Tent",
    status: "suggested",
    category: CAMPING,
  },
]

describe("GearCloset", () => {
  beforeEach(() => {
    mockCreateItem.mockReset()
    mockRefresh.mockReset()
    mockCreateItem.mockResolvedValue({ success: true })
  })

  it("renders the user's items with names and category labels", () => {
    render(<GearCloset items={ITEMS} categories={CATEGORIES} />)
    expect(screen.getByText("Bilge pump")).toBeTruthy()
    expect(screen.getByText("Tent")).toBeTruthy()
    expect(screen.getAllByText("First aid").length).toBeGreaterThan(0)
  })

  it("shows the ownership status of each item", () => {
    render(<GearCloset items={ITEMS} categories={CATEGORIES} />)
    expect(screen.getByText(/owned/i)).toBeTruthy()
    expect(screen.getByText(/suggested/i)).toBeTruthy()
  })

  it("renders an empty state with a call to action when there are no items", () => {
    render(<GearCloset items={[]} categories={CATEGORIES} />)
    expect(screen.getByText(/no gear yet/i)).toBeTruthy()
  })

  it("filters the list by category", async () => {
    const user = userEvent.setup()
    render(<GearCloset items={ITEMS} categories={CATEGORIES} />)

    await user.click(screen.getByRole("button", { name: "Camping" }))

    expect(screen.queryByText("Bilge pump")).toBeNull()
    expect(screen.getByText("Tent")).toBeTruthy()
  })

  it("creates a new item from the add-gear form", async () => {
    const user = userEvent.setup()
    render(<GearCloset items={ITEMS} categories={CATEGORIES} />)

    await user.type(screen.getByPlaceholderText(/add gear/i), "Spare paddle")
    await user.click(screen.getByRole("button", { name: /^add$/i }))

    expect(mockCreateItem).toHaveBeenCalledWith(expect.objectContaining({ name: "Spare paddle" }))
  })
})
