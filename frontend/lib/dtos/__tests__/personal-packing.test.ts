import { describe, it, expect } from "vitest"
import { PersonalPackingItemSchema, PersonalPackingItemsSchema } from "../personal-packing"

const ITEM_ID = "01952f1a-0000-7000-8000-000000000a01"
const ENTRY_ID = "01952f1a-0000-7000-8000-000000000e99"

const ENTRY_FIXTURE = {
  id: ENTRY_ID,
  checked: false,
  item: {
    id: ITEM_ID,
    name: "Drysuit",
    status: "owned",
    category: { id: "01952f1a-0000-7000-8000-0000000000c1", slug: "gear", name: "Gear" },
  },
}

describe("PersonalPackingItemSchema", () => {
  it("parses a packing entry nesting its gear-closet item", () => {
    const result = PersonalPackingItemSchema.safeParse(ENTRY_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.checked).toBe(false)
      expect(result.data.item?.name).toBe("Drysuit")
      expect(result.data.item?.category?.slug).toBe("gear")
    }
  })

  it("parses a checked entry", () => {
    const result = PersonalPackingItemSchema.safeParse({ ...ENTRY_FIXTURE, checked: true })
    expect(result.success).toBe(true)
  })

  it("parses a list of packing entries", () => {
    const result = PersonalPackingItemsSchema.safeParse([ENTRY_FIXTURE])
    expect(result.success).toBe(true)
  })
})
