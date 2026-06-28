import { describe, it, expect } from "vitest"
import { PaddlerSearchResultSchema, PaddlerSearchPageSchema } from "../paddler-search"

// Mirrors the real search response shape — note: NO `stats` (search rows omit it).
const RESULT_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000003",
  username: "seapaddler",
  name: "Maren",
  surname: "Vik",
  avatarUrl: null,
  bio: null,
  homeLocation: null,
  certifications: [],
  relationship: "none",
  connectionId: null,
}

describe("PaddlerSearchResultSchema", () => {
  it("parses a result with no relationship", () => {
    expect(PaddlerSearchResultSchema.safeParse(RESULT_FIXTURE).success).toBe(true)
  })

  it("parses a result that has no stats field (search omits stats)", () => {
    expect("stats" in RESULT_FIXTURE).toBe(false)
    expect(PaddlerSearchResultSchema.safeParse(RESULT_FIXTURE).success).toBe(true)
  })

  it("parses a buddy result carrying a connection id", () => {
    const result = PaddlerSearchResultSchema.safeParse({
      ...RESULT_FIXTURE,
      relationship: "buddy",
      connectionId: "01952f1a-0000-7000-8000-0000000000aa",
    })
    expect(result.success).toBe(true)
  })

  it("requires the id", () => {
    const { id: _id, ...withoutId } = RESULT_FIXTURE
    void _id
    expect(PaddlerSearchResultSchema.safeParse(withoutId).success).toBe(false)
  })
})

describe("PaddlerSearchPageSchema", () => {
  it("parses a paginated envelope", () => {
    const result = PaddlerSearchPageSchema.safeParse({
      items: [RESULT_FIXTURE],
      total: 1,
      page: 1,
      pages: 1,
    })
    expect(result.success).toBe(true)
  })

  it("parses an empty page", () => {
    const result = PaddlerSearchPageSchema.safeParse({
      items: [],
      total: 0,
      page: 1,
      pages: 1,
    })
    expect(result.success).toBe(true)
  })
})
