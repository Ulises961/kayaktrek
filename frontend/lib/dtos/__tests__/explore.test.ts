import { describe, it, expect } from "vitest"
import { ExploreItemSchema, ExplorePageSchema, PublicItineraryDetailSchema } from "../itinerary"

const ITEM = {
  id: "01952f1a-0000-7000-8000-000000000010",
  name: "Aegean loop",
  totalMiles: 42.5,
  dayCount: 3,
  season: "summer",
  centroidLat: 37.1,
  centroidLng: 25.3,
  createdFromId: null,
  originalAuthor: null,
}

describe("ExploreItemSchema", () => {
  it("parses a plain (non-fork) item", () => {
    const item = ExploreItemSchema.parse(ITEM)
    expect(item.season).toBe("summer")
    expect(item.originalAuthor).toBeNull()
  })

  it("parses a forked item with attribution", () => {
    const item = ExploreItemSchema.parse({
      ...ITEM,
      createdFromId: "01952f1a-0000-7000-8000-000000000099",
      originalAuthor: { username: "seapaddler", name: "Maren", linkable: true },
    })
    expect(item.originalAuthor?.username).toBe("seapaddler")
    expect(item.originalAuthor?.linkable).toBe(true)
  })

  it("tolerates a null centroid (route with no points)", () => {
    const item = ExploreItemSchema.parse({ ...ITEM, centroidLat: null, centroidLng: null })
    expect(item.centroidLat).toBeNull()
  })

  it("rejects missing id", () => {
    const { id: _id, ...withoutId } = ITEM
    void _id
    expect(ExploreItemSchema.safeParse(withoutId).success).toBe(false)
  })
})

describe("ExplorePageSchema", () => {
  it("parses the pagination envelope", () => {
    const page = ExplorePageSchema.parse({ items: [ITEM], total: 1, page: 1, pages: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.total).toBe(1)
  })

  it("defaults to an empty page", () => {
    const page = ExplorePageSchema.parse({})
    expect(page.items).toEqual([])
    expect(page.pages).toBe(1)
  })
})

describe("PublicItineraryDetailSchema attribution", () => {
  it("parses createdFromId + originalAuthor", () => {
    const detail = PublicItineraryDetailSchema.parse({
      id: "01952f1a-0000-7000-8000-000000000010",
      name: "My copy",
      createdFromId: "01952f1a-0000-7000-8000-000000000099",
      originalAuthor: { username: "seapaddler", name: "Maren", linkable: false },
      days: [],
    })
    expect(detail.createdFromId).toBeTruthy()
    expect(detail.originalAuthor?.linkable).toBe(false)
  })
})
