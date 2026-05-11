import { describe, it, expect } from "vitest"
import { LogisticsSchema, LogisticsFieldsSchema } from "../logistics"

const VALID_LOGISTICS = {
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: "01952f1a-0000-7000-8000-000000000002",
  departurePoint: "La Escala harbour",
  arrivalPoint: "Cadaqués cove",
  travelNotes: "Avoid the cape if north wind > 20kn",
  shoreContactName: "Maria García",
  shoreContactEmail: "maria@example.com",
  shoreContactPhone: "+34600000000",
  shoreContactRelationship: "Partner",
  shuttleNotes: "Meet at the trailhead after landing",
  shuttleMeetingTime: "17:00",
}

describe("LogisticsSchema", () => {
  it("parses a fully populated logistics object", () => {
    const result = LogisticsSchema.safeParse(VALID_LOGISTICS)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.departurePoint).toBe("La Escala harbour")
    }
  })

  it("accepts an empty object (logistics not yet created)", () => {
    const result = LogisticsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("accepts null for all nullable fields", () => {
    const result = LogisticsSchema.safeParse({
      ...VALID_LOGISTICS,
      departurePoint: null,
      arrivalPoint: null,
      shoreContactName: null,
      shoreContactEmail: null,
    })
    expect(result.success).toBe(true)
  })
})

describe("LogisticsFieldsSchema", () => {
  it("accepts valid leader fields", () => {
    const result = LogisticsFieldsSchema.safeParse({
      departurePoint: "La Escala",
      arrivalPoint: "Cadaqués",
      travelNotes: "Check tide tables",
      shoreContactName: "Maria",
      shoreContactEmail: "maria@example.com",
      shoreContactPhone: "+34600000000",
      shoreContactRelationship: "Partner",
      shuttleNotes: "Meet at 17:00",
      shuttleMeetingTime: "17:00",
    })
    expect(result.success).toBe(true)
  })

  it("accepts an empty object (all fields optional)", () => {
    const result = LogisticsFieldsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("rejects an invalid email for shore contact", () => {
    const result = LogisticsFieldsSchema.safeParse({ shoreContactEmail: "not-an-email" })
    expect(result.success).toBe(false)
  })

  it("allows empty string for shoreContactEmail (field cleared)", () => {
    const result = LogisticsFieldsSchema.safeParse({ shoreContactEmail: "" })
    expect(result.success).toBe(true)
  })
})
