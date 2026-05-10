import { describe, it, expect } from "vitest"
import { DocumentSchema, DocumentFieldsSchema, DOCUMENT_TYPES } from "../document"

const VALID_DOCUMENT = {
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: "01952f1a-0000-7000-8000-000000000002",
  ownerId: "01952f1a-0000-7000-8000-000000000003",
  type: "licence",
  name: "Sea kayak licence",
  expiryDate: "2027-01-01",
  notes: "Must carry original",
}

describe("DocumentSchema", () => {
  it("parses a valid document", () => {
    const result = DocumentSchema.safeParse(VALID_DOCUMENT)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe("licence")
      expect(result.data.name).toBe("Sea kayak licence")
    }
  })

  it("accepts all valid types", () => {
    for (const type of DOCUMENT_TYPES) {
      const result = DocumentSchema.safeParse({ ...VALID_DOCUMENT, type })
      expect(result.success).toBe(true)
    }
  })

  it("rejects an unknown type", () => {
    const result = DocumentSchema.safeParse({ ...VALID_DOCUMENT, type: "contract" })
    expect(result.success).toBe(false)
  })

  it("accepts null optional fields", () => {
    const result = DocumentSchema.safeParse({
      ...VALID_DOCUMENT,
      expiryDate: null,
      notes: null,
    })
    expect(result.success).toBe(true)
  })
})

describe("DocumentFieldsSchema", () => {
  it("accepts valid create data", () => {
    const result = DocumentFieldsSchema.safeParse({
      type: "insurance",
      name: "Travel insurance policy",
      expiryDate: "2027-06-30",
      notes: "Policy number: INS-999",
    })
    expect(result.success).toBe(true)
  })

  it("requires type", () => {
    const result = DocumentFieldsSchema.safeParse({ name: "Licence" })
    expect(result.success).toBe(false)
  })

  it("requires name", () => {
    const result = DocumentFieldsSchema.safeParse({ type: "licence" })
    expect(result.success).toBe(false)
  })

  it("rejects blank name", () => {
    const result = DocumentFieldsSchema.safeParse({ type: "permit", name: "  " })
    expect(result.success).toBe(false)
  })

  it("accepts optional expiry date in ISO format", () => {
    const result = DocumentFieldsSchema.safeParse({
      type: "permit",
      name: "Marine park permit",
      expiryDate: "2026-08-31",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a malformed expiry date", () => {
    const result = DocumentFieldsSchema.safeParse({
      type: "permit",
      name: "Marine park permit",
      expiryDate: "31/08/2026",
    })
    expect(result.success).toBe(false)
  })

  it("accepts empty expiryDate (no expiry set)", () => {
    const result = DocumentFieldsSchema.safeParse({
      type: "other",
      name: "Miscellaneous doc",
      expiryDate: "",
    })
    expect(result.success).toBe(true)
  })
})
