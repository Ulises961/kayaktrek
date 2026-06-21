import { describe, it, expect } from "vitest"
import { ItemCategorySchema, ItemCategoriesSchema } from "../item-category"
import { ItemSchema, ItemsSchema } from "../item"
import { InventorySchema, TripRequirementSchema } from "../inventory"

const CATEGORY_ID = "01952f1a-0000-7000-8000-0000000000c1"
const ITEM_ID = "01952f1a-0000-7000-8000-000000000a01"
const ITEM_ID_2 = "01952f1a-0000-7000-8000-000000000a02"
const REQ_ID = "01952f1a-0000-7000-8000-000000000b01"
const INVENTORY_ID = "01952f1a-0000-7000-8000-000000000c01"
const TRIP_ID = "01952f1a-0000-7000-8000-000000000d01"
const USER_ID = "01952f1a-0000-7000-8000-000000000e01"

const CATEGORY_FIXTURE = {
  id: CATEGORY_ID,
  slug: "first_aid",
  name: "First aid",
}

const ITEM_FIXTURE = {
  id: ITEM_ID,
  userId: USER_ID,
  name: "Bilge pump",
  checked: false,
  status: "owned",
  category: CATEGORY_FIXTURE,
}

const REQUIREMENT_FIXTURE = {
  id: REQ_ID,
  name: "Bilge pump",
  category: "safety",
  catalogItemId: null,
  coveringItemId: ITEM_ID,
  coveringItem: ITEM_FIXTURE,
  checked: false,
  status: "covered",
  contributors: [{ id: USER_ID, username: "paddler", name: "Pat" }],
}

const INVENTORY_FIXTURE = {
  id: INVENTORY_ID,
  tripId: TRIP_ID,
  userId: USER_ID,
  requirements: [REQUIREMENT_FIXTURE],
}

describe("ItemCategorySchema", () => {
  it("parses a category entity", () => {
    const result = ItemCategorySchema.safeParse(CATEGORY_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.slug).toBe("first_aid")
      expect(result.data.name).toBe("First aid")
    }
  })

  it("parses a list of categories", () => {
    const result = ItemCategoriesSchema.safeParse([CATEGORY_FIXTURE])
    expect(result.success).toBe(true)
  })
})

describe("ItemSchema", () => {
  it("parses a personal item with nested category and status", () => {
    const result = ItemSchema.safeParse(ITEM_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("owned")
      expect(result.data.category?.slug).toBe("first_aid")
    }
  })

  it("accepts suggested status", () => {
    const result = ItemSchema.safeParse({ ...ITEM_FIXTURE, status: "suggested" })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown status", () => {
    const result = ItemSchema.safeParse({ ...ITEM_FIXTURE, status: "packed" })
    expect(result.success).toBe(false)
  })

  it("allows a missing/null category (uncategorised item)", () => {
    const result = ItemSchema.safeParse({
      id: ITEM_ID_2,
      userId: USER_ID,
      name: "Spare line",
    })
    expect(result.success).toBe(true)
  })

  it("parses a list of items", () => {
    const result = ItemsSchema.safeParse([ITEM_FIXTURE])
    expect(result.success).toBe(true)
  })
})

describe("TripRequirementSchema", () => {
  it("parses a covered requirement with its covering item and contributors", () => {
    const result = TripRequirementSchema.safeParse(REQUIREMENT_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe("covered")
      expect(result.data.coveringItem?.name).toBe("Bilge pump")
      expect(result.data.contributors).toHaveLength(1)
    }
  })

  it("parses a needed requirement with no covering item", () => {
    const result = TripRequirementSchema.safeParse({
      id: REQ_ID,
      name: "Tow line",
      checked: false,
      status: "needed",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown status", () => {
    const result = TripRequirementSchema.safeParse({
      ...REQUIREMENT_FIXTURE,
      status: "partial",
    })
    expect(result.success).toBe(false)
  })
})

describe("InventorySchema", () => {
  it("parses an inventory nesting its requirement slots", () => {
    const result = InventorySchema.safeParse(INVENTORY_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.requirements).toHaveLength(1)
      expect(result.data.requirements?.[0].name).toBe("Bilge pump")
    }
  })

  it("parses an inventory with no requirements", () => {
    const result = InventorySchema.safeParse({
      id: INVENTORY_ID,
      tripId: TRIP_ID,
    })
    expect(result.success).toBe(true)
  })
})
