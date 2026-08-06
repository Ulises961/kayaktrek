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
  setItemOwned: vi.fn(),
  deleteItem: vi.fn(),
  toggleDefaultPack: vi.fn(),
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

  it("groups items under uppercase category section labels", () => {
    render(<GearCloset items={ITEMS} categories={CATEGORIES} />)
    expect(screen.getByText("Bilge pump")).toBeTruthy()
    expect(screen.getByText("Tent")).toBeTruthy()
    // One section header per non-empty category (distinct from the filter chips,
    // which are buttons).
    const headers = screen.getAllByText(/first aid|camping/i).filter((el) => el.tagName === "P")
    expect(headers).toHaveLength(2)
  })

  it("buckets an item without a category under Uncategorised", () => {
    render(
      <GearCloset
        items={[{ id: "01952f1a-0000-7000-8000-000000000a09", name: "Mystery strap" }]}
        categories={CATEGORIES}
      />,
    )
    expect(screen.getByText("Uncategorised")).toBeTruthy()
    expect(screen.getByText("Mystery strap")).toBeTruthy()
  })

  it("shows the ownership state of each item via its switch", () => {
    render(<GearCloset items={ITEMS} categories={CATEGORIES} />)
    const switches = screen.getAllByRole("switch")
    expect(switches.map((s) => s.getAttribute("aria-checked"))).toEqual(["true", "false"])
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

  it("displays an error when adding gear fails", async () => {
    const user = userEvent.setup()
    mockCreateItem.mockResolvedValueOnce({
      success: false,
      error: "You already own this item",
    })
    render(<GearCloset items={ITEMS} categories={CATEGORIES} />)

    await user.type(screen.getByPlaceholderText(/add gear/i), "Bilge pump")
    await user.click(screen.getByRole("button", { name: /^add$/i }))

    expect(screen.getByText("You already own this item")).toBeTruthy()
  })
})
