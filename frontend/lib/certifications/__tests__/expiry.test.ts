import { describe, it, expect } from "vitest"
import { isCertExpired } from "../expiry"

describe("isCertExpired", () => {
  it("returns false when there is no validUntil date", () => {
    expect(isCertExpired(null)).toBe(false)
    expect(isCertExpired(undefined)).toBe(false)
    expect(isCertExpired("")).toBe(false)
  })

  it("returns true for a date in the past", () => {
    expect(isCertExpired("2000-01-01")).toBe(true)
  })

  it("returns false for a date far in the future", () => {
    expect(isCertExpired("2999-12-31")).toBe(false)
  })

  it("returns false for today (expires at end of the valid day)", () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isCertExpired(today)).toBe(false)
  })
})
