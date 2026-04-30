import { describe, it, expect } from "vitest"
import { LogSchema, LogPageSchema } from "../log"

const LOG_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000020",
  userId: "01952f1a-0000-7000-8000-000000000001",
  date: "2026-07-03",
  hours: 6.5,
  avgSea: 3,
  distance: 22.4,
  notes: "Good conditions, light headwind.",
}

describe("LogSchema", () => {
  it("parses a full log fixture", () => {
    const result = LogSchema.safeParse(LOG_FIXTURE)
    expect(result.success).toBe(true)
  })

  it("accepts a log with only required fields absent (all nullable)", () => {
    const result = LogSchema.safeParse({ id: LOG_FIXTURE.id })
    expect(result.success).toBe(true)
  })

  it("rejects avgSea above 12", () => {
    const result = LogSchema.safeParse({ ...LOG_FIXTURE, avgSea: 13 })
    expect(result.success).toBe(false)
  })

  it("rejects avgSea below 0", () => {
    const result = LogSchema.safeParse({ ...LOG_FIXTURE, avgSea: -1 })
    expect(result.success).toBe(false)
  })

  it("accepts avgSea at boundaries 0 and 12", () => {
    expect(LogSchema.safeParse({ ...LOG_FIXTURE, avgSea: 0 }).success).toBe(true)
    expect(LogSchema.safeParse({ ...LOG_FIXTURE, avgSea: 12 }).success).toBe(true)
  })

  it("rejects hours above 24", () => {
    const result = LogSchema.safeParse({ ...LOG_FIXTURE, hours: 25 })
    expect(result.success).toBe(false)
  })

  it("rejects negative distance", () => {
    const result = LogSchema.safeParse({ ...LOG_FIXTURE, distance: -1 })
    expect(result.success).toBe(false)
  })

  it("accepts null for all optional fields", () => {
    const result = LogSchema.safeParse({ ...LOG_FIXTURE, hours: null, avgSea: null, distance: null, notes: null })
    expect(result.success).toBe(true)
  })
})

describe("LogPageSchema", () => {
  const page = { items: [LOG_FIXTURE], total: 1, page: 1, pages: 1 }

  it("parses a paginated log response", () => {
    const result = LogPageSchema.safeParse(page)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.total).toBe(1)
      expect(result.data.items).toHaveLength(1)
    }
  })

  it("rejects a response missing items", () => {
    const { items: _, ...noItems } = page
    expect(LogPageSchema.safeParse(noItems).success).toBe(false)
  })

  it("rejects a response missing total", () => {
    const { total: _, ...noTotal } = page
    expect(LogPageSchema.safeParse(noTotal).success).toBe(false)
  })
})
