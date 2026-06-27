import { describe, it, expect } from "vitest"
import { CertificationSchema, CertificationFieldsSchema } from "../certification"

const CERT_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000030",
  userId: "01952f1a-0000-7000-8000-000000000001",
  organization: "British Canoeing",
  award: "Sea Kayak Leader",
  membershipNumber: "BC-12345",
  awardedAt: "2024-05-01",
  validUntil: "2027-05-01",
}

describe("CertificationSchema", () => {
  it("parses a full certification fixture", () => {
    expect(CertificationSchema.safeParse(CERT_FIXTURE).success).toBe(true)
  })

  it("accepts a cert with only organization + award", () => {
    const result = CertificationSchema.safeParse({
      organization: "RYA",
      award: "Day Skipper",
    })
    expect(result.success).toBe(true)
  })

  it("accepts null membership number and dates", () => {
    const result = CertificationSchema.safeParse({
      ...CERT_FIXTURE,
      membershipNumber: null,
      awardedAt: null,
      validUntil: null,
    })
    expect(result.success).toBe(true)
  })
})

describe("CertificationFieldsSchema", () => {
  it("requires organization and award", () => {
    expect(CertificationFieldsSchema.safeParse({ organization: "", award: "" }).success).toBe(false)
  })

  it("rejects HTML in organization", () => {
    expect(
      CertificationFieldsSchema.safeParse({ organization: "<b>x</b>", award: "Leader" }).success,
    ).toBe(false)
  })

  it("accepts valid fields with optional dates omitted", () => {
    expect(
      CertificationFieldsSchema.safeParse({ organization: "BC", award: "Sea Leader" }).success,
    ).toBe(true)
  })
})
