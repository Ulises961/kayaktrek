import { describe, it, expect } from "vitest"
import { ReservationSchema, ReservationFieldsSchema, RESERVATION_TYPES } from "../reservation"

const VALID_RESERVATION = {
  id: "01952f1a-0000-7000-8000-000000000001",
  tripId: "01952f1a-0000-7000-8000-000000000002",
  ownerId: "01952f1a-0000-7000-8000-000000000003",
  type: "accommodation",
  name: "Hotel Cap de Creus",
  date: "2026-07-03",
  confirmationNumber: "CONF-1234",
  notes: "Sea view room",
  url: "https://hotel.example.com",
}

describe("ReservationSchema", () => {
  it("parses a valid reservation", () => {
    const result = ReservationSchema.safeParse(VALID_RESERVATION)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe("accommodation")
      expect(result.data.name).toBe("Hotel Cap de Creus")
    }
  })

  it("accepts all valid types", () => {
    for (const type of RESERVATION_TYPES) {
      const result = ReservationSchema.safeParse({ ...VALID_RESERVATION, type })
      expect(result.success).toBe(true)
    }
  })

  it("rejects an unknown type", () => {
    const result = ReservationSchema.safeParse({ ...VALID_RESERVATION, type: "campsite" })
    expect(result.success).toBe(false)
  })

  it("accepts null optional fields", () => {
    const result = ReservationSchema.safeParse({
      ...VALID_RESERVATION,
      date: null,
      confirmationNumber: null,
      notes: null,
      url: null,
    })
    expect(result.success).toBe(true)
  })
})

describe("ReservationFieldsSchema", () => {
  it("accepts valid create data", () => {
    const result = ReservationFieldsSchema.safeParse({
      type: "transport",
      name: "Ferry La Escala",
      date: "2026-07-01",
      confirmationNumber: "FER-001",
      notes: "",
      url: "",
    })
    expect(result.success).toBe(true)
  })

  it("requires type", () => {
    const result = ReservationFieldsSchema.safeParse({ name: "Hotel" })
    expect(result.success).toBe(false)
  })

  it("requires name", () => {
    const result = ReservationFieldsSchema.safeParse({ type: "accommodation" })
    expect(result.success).toBe(false)
  })

  it("rejects blank name", () => {
    const result = ReservationFieldsSchema.safeParse({ type: "accommodation", name: "   " })
    expect(result.success).toBe(false)
  })

  it("accepts optional date in ISO format", () => {
    const result = ReservationFieldsSchema.safeParse({
      type: "permit",
      name: "Park entry",
      date: "2026-07-02",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a malformed date", () => {
    const result = ReservationFieldsSchema.safeParse({
      type: "permit",
      name: "Park entry",
      date: "July 2nd",
    })
    expect(result.success).toBe(false)
  })
})
