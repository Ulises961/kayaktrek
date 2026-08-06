import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockCreateCatalogItem, mockDeleteCatalogItem, mockResetCatalogToDefault, mockRefresh } =
  vi.hoisted(() => ({
    mockCreateCatalogItem: vi.fn(),
    mockDeleteCatalogItem: vi.fn(),
    mockResetCatalogToDefault: vi.fn(),
    mockRefresh: vi.fn(),
  }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/inventory/catalog-actions", () => ({
  createCatalogItem: mockCreateCatalogItem,
  deleteCatalogItem: mockDeleteCatalogItem,
  resetCatalogToDefault: mockResetCatalogToDefault,
}))

import { CatalogKitSection } from "../catalog-kit-section"
import type { CatalogItem } from "@/lib/dtos/catalog-item"
import type { ItemCategory } from "@/lib/dtos/item-category"

const GEAR: ItemCategory = {
  id: "01952f1a-0000-7000-8000-0000000000c1",
  slug: "gear",
  name: "Gear",
}
const REPAIR: ItemCategory = {
  id: "01952f1a-0000-7000-8000-0000000000c2",
  slug: "repair",
  name: "Repair",
}
const CATEGORIES = [GEAR, REPAIR]

const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "01952f1a-0000-7000-8000-000000000a01",
    name: "Spare paddle (split)",
    category: GEAR,
  },
  {
    id: "01952f1a-0000-7000-8000-000000000a02",
    name: "Repair kit",
    category: REPAIR,
  },
]

describe("CatalogKitSection", () => {
  beforeEach(() => {
    mockCreateCatalogItem.mockReset()
    mockDeleteCatalogItem.mockReset()
    mockResetCatalogToDefault.mockReset()
    mockRefresh.mockReset()
    mockCreateCatalogItem.mockResolvedValue({ success: true })
    mockDeleteCatalogItem.mockResolvedValue({ success: true })
    mockResetCatalogToDefault.mockResolvedValue({ success: true })
  })

  it("renders the curator's template items with category labels", () => {
    render(<CatalogKitSection items={CATALOG_ITEMS} categories={CATEGORIES} />)
    expect(screen.getByText("Spare paddle (split)")).toBeTruthy()
    expect(screen.getByText("Repair kit")).toBeTruthy()
    expect(screen.getAllByText("Gear").length).toBeGreaterThan(0)
  })

  it("shows an empty state with a start-from-default action when there are no items", () => {
    render(<CatalogKitSection items={[]} categories={CATEGORIES} />)
    expect(screen.getByText(/start from the default list/i)).toBeTruthy()
  })

  it("does not show the start-from-default action once the template is non-empty", () => {
    render(<CatalogKitSection items={CATALOG_ITEMS} categories={CATEGORIES} />)
    expect(screen.queryByRole("button", { name: /start from the default list/i })).toBeNull()
  })

  it("bootstraps the template from the default list", async () => {
    const user = userEvent.setup()
    render(<CatalogKitSection items={[]} categories={CATEGORIES} />)

    await user.click(screen.getByRole("button", { name: /start from the default list/i }))

    expect(mockResetCatalogToDefault).toHaveBeenCalled()
  })

  it("displays an error when reset fails", async () => {
    const user = userEvent.setup()
    mockResetCatalogToDefault.mockResolvedValueOnce({
      success: false,
      error: "Failed to reset catalog",
    })
    render(<CatalogKitSection items={[]} categories={CATEGORIES} />)

    await user.click(screen.getByRole("button", { name: /start from the default list/i }))

    expect(screen.getByText("Failed to reset catalog")).toBeTruthy()
  })

  it("adds a new template item from the form", async () => {
    const user = userEvent.setup()
    render(<CatalogKitSection items={CATALOG_ITEMS} categories={CATEGORIES} />)

    await user.type(screen.getByPlaceholderText(/add.*default trip kit|add.*item/i), "Drogue")
    await user.click(screen.getByRole("button", { name: /^add$/i }))

    expect(mockCreateCatalogItem).toHaveBeenCalledWith(expect.objectContaining({ name: "Drogue" }))
  })

  it("displays an error when adding a template item fails", async () => {
    const user = userEvent.setup()
    mockCreateCatalogItem.mockResolvedValueOnce({
      success: false,
      error: "Item name already exists",
    })
    render(<CatalogKitSection items={CATALOG_ITEMS} categories={CATEGORIES} />)

    await user.type(screen.getByPlaceholderText(/add.*default trip kit|add.*item/i), "Drogue")
    await user.click(screen.getByRole("button", { name: /^add$/i }))

    expect(screen.getByText("Item name already exists")).toBeTruthy()
  })

  it("removes a template item after confirming in the dialog", async () => {
    const user = userEvent.setup()
    render(<CatalogKitSection items={CATALOG_ITEMS} categories={CATEGORIES} />)

    await user.click(screen.getByRole("button", { name: /remove spare paddle/i }))
    await user.click(screen.getByRole("button", { name: /^remove$/i }))

    expect(mockDeleteCatalogItem).toHaveBeenCalledWith(CATALOG_ITEMS[0].id)
  })

  it("displays an error when removing a template item fails", async () => {
    const user = userEvent.setup()
    mockDeleteCatalogItem.mockResolvedValueOnce({
      success: false,
      error: "Cannot remove item in use",
    })
    render(<CatalogKitSection items={CATALOG_ITEMS} categories={CATEGORIES} />)

    await user.click(screen.getByRole("button", { name: /remove spare paddle/i }))
    await user.click(screen.getByRole("button", { name: /^remove$/i }))

    expect(screen.getByText("Cannot remove item in use")).toBeTruthy()
  })

  it("does not remove a template item when the dialog is cancelled", async () => {
    const user = userEvent.setup()
    render(<CatalogKitSection items={CATALOG_ITEMS} categories={CATEGORIES} />)

    await user.click(screen.getByRole("button", { name: /remove spare paddle/i }))
    await user.click(screen.getByRole("button", { name: /cancel/i }))

    expect(mockDeleteCatalogItem).not.toHaveBeenCalled()
  })
})
