import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockConfirmItemOwned, mockDeleteItem, mockRefresh } = vi.hoisted(() => ({
  mockConfirmItemOwned: vi.fn(),
  mockDeleteItem: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/inventory/actions", () => ({
  confirmItemOwned: mockConfirmItemOwned,
  deleteItem: mockDeleteItem,
}))

import { ItemRow } from "../item-row"
import type { Item } from "@/lib/dtos/item"

const CATEGORY = {
  id: "01952f1a-0000-7000-8000-0000000000c1",
  slug: "first_aid",
  name: "First aid",
}

const OWNED: Item = {
  id: "01952f1a-0000-7000-8000-000000000a01",
  name: "Bilge pump",
  status: "owned",
  category: CATEGORY,
}

const SUGGESTED: Item = {
  id: "01952f1a-0000-7000-8000-000000000a02",
  name: "Tent",
  status: "suggested",
  category: CATEGORY,
}

describe("ItemRow", () => {
  beforeEach(() => {
    mockConfirmItemOwned.mockReset()
    mockDeleteItem.mockReset()
    mockRefresh.mockReset()
    mockConfirmItemOwned.mockResolvedValue({ success: true })
    mockDeleteItem.mockResolvedValue({ success: true })
  })

  it("renders the item name, category and owned status", () => {
    render(<ItemRow item={OWNED} />)
    expect(screen.getByText("Bilge pump")).toBeTruthy()
    expect(screen.getByText("First aid")).toBeTruthy()
    expect(screen.getByText(/owned/i)).toBeTruthy()
  })

  it("does not offer a confirm-ownership action for an already-owned item", () => {
    render(<ItemRow item={OWNED} />)
    expect(screen.queryByRole("button", { name: /own this/i })).toBeNull()
  })

  it("offers a confirm-ownership action for a suggested item", () => {
    render(<ItemRow item={SUGGESTED} />)
    expect(screen.getByText(/suggested/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /own this/i })).toBeTruthy()
  })

  it("promotes a suggested item to owned", async () => {
    const user = userEvent.setup()
    render(<ItemRow item={SUGGESTED} />)

    await user.click(screen.getByRole("button", { name: /own this/i }))

    expect(mockConfirmItemOwned).toHaveBeenCalledWith(SUGGESTED.id)
  })

  it("deletes the item after confirmation", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("button", { name: /delete/i }))

    expect(mockDeleteItem).toHaveBeenCalledWith(OWNED.id)
  })

  it("does not delete when confirmation is dismissed", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(false)
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("button", { name: /delete/i }))

    expect(mockDeleteItem).not.toHaveBeenCalled()
  })
})
