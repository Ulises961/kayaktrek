import { describe, it, expect } from "vitest"
import { TravelDocumentSchema, TravelDocumentFieldsSchema, TRAVEL_DOCUMENT_TYPES } from "../travel-document"

const VALID_DOCUMENT = {
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: "01952f1a-0000-7000-8000-000000000002",
  ownerId: "01952f1a-0000-7000-8000-000000000003",
  type: "accommodation",
  name: "Hotel Cap de Creus",
  date: "2026-07-03",
  expiryDate: null,
  confirmationNumber: "CONF-1234",
  url: "https://hotel.example.com",
  notes: "Sea view room",
  attachmentPath: null,
}

describe("TravelDocumentSchema", () => {
  it("parses a valid travel document", () => {
    const result = TravelDocumentSchema.safeParse(VALID_DOCUMENT)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe("accommodation")
      expect(result.data.name).toBe("Hotel Cap de Creus")
    }
  })

  it("accepts all valid types", () => {
    for (const type of TRAVEL_DOCUMENT_TYPES) {
      const result = TravelDocumentSchema.safeParse({ ...VALID_DOCUMENT, type })
      expect(result.success).toBe(true)
    }
  })

  it("rejects an unknown type", () => {
    const result = TravelDocumentSchema.safeParse({ ...VALID_DOCUMENT, type: "campsite" })
    expect(result.success).toBe(false)
  })

  it("accepts null optional fields", () => {
    const result = TravelDocumentSchema.safeParse({
      ...VALID_DOCUMENT,
      date: null,
      expiryDate: null,
      confirmationNumber: null,
      url: null,
      notes: null,
      attachmentPath: null,
    })
    expect(result.success).toBe(true)
  })
})

describe("TravelDocumentFieldsSchema", () => {
  it("accepts valid create data", () => {
    const result = TravelDocumentFieldsSchema.safeParse({
      type: "transport",
      name: "Ferry La Escala",
      date: "2026-07-01",
      expiryDate: "2026-12-31",
      confirmationNumber: "FER-001",
      notes: "",
      url: "",
    })
    expect(result.success).toBe(true)
  })

  it("requires type", () => {
    const result = TravelDocumentFieldsSchema.safeParse({ name: "Hotel" })
    expect(result.success).toBe(false)
  })

  it("requires name", () => {
    const result = TravelDocumentFieldsSchema.safeParse({ type: "accommodation" })
    expect(result.success).toBe(false)
  })

  it("rejects blank name", () => {
    const result = TravelDocumentFieldsSchema.safeParse({ type: "accommodation", name: "   " })
    expect(result.success).toBe(false)
  })

  it("accepts optional date in ISO format", () => {
    const result = TravelDocumentFieldsSchema.safeParse({
      type: "permit",
      name: "Park entry",
      date: "2026-07-02",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a malformed date", () => {
    const result = TravelDocumentFieldsSchema.safeParse({
      type: "permit",
      name: "Park entry",
      date: "July 2nd",
    })
    expect(result.success).toBe(false)
  })

  it("rejects a malformed expiry date", () => {
    const result = TravelDocumentFieldsSchema.safeParse({
      type: "insurance",
      name: "Paddler insurance",
      expiryDate: "not-a-date",
    })
    expect(result.success).toBe(false)
  })
})
