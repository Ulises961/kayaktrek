import { describe, it, expect, vi, afterEach } from "vitest"
import { isCertExpired, isElevatedValid } from "../expiry"

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

// isElevatedValid gates whether a cached re-auth token can be reused without prompting for
// the password again (components/profile/certifications-section.tsx). Getting the boundary
// wrong in either direction is a real security-relevant bug: too permissive re-uses an expired
// elevated token past its 5-minute window, too strict forces a needless re-prompt.
describe("isElevatedValid", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns true while the expiry timestamp is still in the future", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    expect(isElevatedValid(1_000_001)).toBe(true)
  })

  it("returns false once the expiry timestamp is in the past", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    expect(isElevatedValid(999_999)).toBe(false)
  })

  it("returns false at the exact boundary (strictly-greater-than, not inclusive)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    expect(isElevatedValid(1_000_000)).toBe(false)
  })
})
