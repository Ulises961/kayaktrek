import { describe, it, expect } from "vitest"
import { CatalogItemSchema, CatalogItemsSchema } from "../catalog-item"

const CATEGORY_ID = "01952f1a-0000-7000-8000-0000000000c1"
const CATALOG_ITEM_ID = "01952f1a-0000-7000-8000-000000000a01"
const OWNER_ID = "01952f1a-0000-7000-8000-000000000e01"

const CATEGORY_FIXTURE = {
  id: CATEGORY_ID,
  slug: "gear",
  name: "Gear",
}

const CATALOG_ITEM_FIXTURE = {
  id: CATALOG_ITEM_ID,
  ownerId: OWNER_ID,
  name: "Spare paddle (split)",
  category: CATEGORY_FIXTURE,
}

describe("CatalogItemSchema", () => {
  it("parses a catalog item with nested category", () => {
    const result = CatalogItemSchema.safeParse(CATALOG_ITEM_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe("Spare paddle (split)")
      expect(result.data.category?.slug).toBe("gear")
    }
  })

  it("allows a missing/null category (uncategorised template entry)", () => {
    const result = CatalogItemSchema.safeParse({
      id: CATALOG_ITEM_ID,
      ownerId: OWNER_ID,
      name: "Custom drogue",
    })
    expect(result.success).toBe(true)
  })

  it("parses a list of catalog items", () => {
    const result = CatalogItemsSchema.safeParse([CATALOG_ITEM_FIXTURE])
    expect(result.success).toBe(true)
  })

  it("rejects missing name", () => {
    const { name: _name, ...withoutName } = CATALOG_ITEM_FIXTURE
    void _name
    expect(CatalogItemSchema.safeParse(withoutName).success).toBe(false)
  })
})
