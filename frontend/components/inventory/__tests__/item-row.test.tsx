import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockSetItemOwned, mockDeleteItem, mockToggleDefaultPack, mockRefresh } = vi.hoisted(() => ({
  mockSetItemOwned: vi.fn(),
  mockDeleteItem: vi.fn(),
  mockToggleDefaultPack: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/inventory/actions", () => ({
  setItemOwned: mockSetItemOwned,
  deleteItem: mockDeleteItem,
  toggleDefaultPack: mockToggleDefaultPack,
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

const ALWAYS_PACKED: Item = {
  id: "01952f1a-0000-7000-8000-000000000a03",
  name: "PFD",
  status: "owned",
  category: CATEGORY,
  defaultPack: true,
}

describe("ItemRow", () => {
  beforeEach(() => {
    mockSetItemOwned.mockReset()
    mockDeleteItem.mockReset()
    mockToggleDefaultPack.mockReset()
    mockRefresh.mockReset()
    mockSetItemOwned.mockResolvedValue({ success: true })
    mockDeleteItem.mockResolvedValue({ success: true })
    mockToggleDefaultPack.mockResolvedValue({ success: true })
  })

  it("renders the item name and a checked owned switch for an owned item", () => {
    render(<ItemRow item={OWNED} />)
    expect(screen.getByText("Bilge pump")).toBeTruthy()
    const toggle = screen.getByRole("switch")
    expect(toggle.getAttribute("aria-checked")).toBe("true")
  })

  it("shows the owned switch unchecked for a suggested item", () => {
    render(<ItemRow item={SUGGESTED} />)
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
  })

  it("promotes a suggested item to owned via the switch", async () => {
    const user = userEvent.setup()
    render(<ItemRow item={SUGGESTED} />)

    await user.click(screen.getByRole("switch"))

    expect(mockSetItemOwned).toHaveBeenCalledWith(SUGGESTED.id, true)
  })

  it("displays an error when setting item owned status fails", async () => {
    const user = userEvent.setup()
    mockSetItemOwned.mockResolvedValueOnce({
      success: false,
      error: "Failed to update item status",
    })
    render(<ItemRow item={SUGGESTED} />)

    await user.click(screen.getByRole("switch"))

    expect(screen.getByText("Failed to update item status")).toBeTruthy()
  })

  it("demotes an owned item back to suggested via the switch", async () => {
    const user = userEvent.setup()
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("switch"))

    expect(mockSetItemOwned).toHaveBeenCalledWith(OWNED.id, false)
  })

  it("deletes the item after confirming in the dialog", async () => {
    const user = userEvent.setup()
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("button", { name: /delete/i }))
    await user.click(screen.getByRole("button", { name: /^delete$/i }))

    expect(mockDeleteItem).toHaveBeenCalledWith(OWNED.id)
  })

  it("displays an error when deleting an item fails", async () => {
    const user = userEvent.setup()
    mockDeleteItem.mockResolvedValueOnce({
      success: false,
      error: "Cannot delete item in use",
    })
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("button", { name: /delete/i }))
    await user.click(screen.getByRole("button", { name: /^delete$/i }))

    expect(screen.getByText("Cannot delete item in use")).toBeTruthy()
  })

  it("does not delete when the dialog is cancelled", async () => {
    const user = userEvent.setup()
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("button", { name: /delete/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    expect(mockDeleteItem).not.toHaveBeenCalled()
  })

  it("offers an opt-in toggle for an item not yet flagged default-pack", () => {
    render(<ItemRow item={OWNED} />)
    const toggle = screen.getByRole("button", { name: /add.*trip checklist/i })
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
  })

  it("shows the toggle pressed for an item already flagged default-pack", () => {
    render(<ItemRow item={ALWAYS_PACKED} />)
    const toggle = screen.getByRole("button", { name: /trip checklist/i })
    expect(toggle.getAttribute("aria-pressed")).toBe("true")
  })

  it("opts an item into default-pack", async () => {
    const user = userEvent.setup()
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("button", { name: /add.*trip checklist/i }))

    expect(mockToggleDefaultPack).toHaveBeenCalledWith(OWNED.id, true)
  })

  it("clears default-pack — don't suggest again on future trips", async () => {
    const user = userEvent.setup()
    render(<ItemRow item={ALWAYS_PACKED} />)

    await user.click(screen.getByRole("button", { name: /trip checklist/i }))

    expect(mockToggleDefaultPack).toHaveBeenCalledWith(ALWAYS_PACKED.id, false)
  })

  it("displays an error when toggling default-pack fails", async () => {
    const user = userEvent.setup()
    mockToggleDefaultPack.mockResolvedValueOnce({
      success: false,
      error: "Failed to update default pack setting",
    })
    render(<ItemRow item={OWNED} />)

    await user.click(screen.getByRole("button", { name: /add.*trip checklist/i }))

    expect(screen.getByText("Failed to update default pack setting")).toBeTruthy()
  })
})
