import { describe, it, expect } from "vitest"
import { formatVesselLength, formatPaddlerName } from "../format"

describe("formatPaddlerName", () => {
  it("joins name and surname", () => {
    expect(formatPaddlerName({ name: "Ada", surname: "Lovelace" })).toBe("Ada Lovelace")
  })

  it("drops the missing half rather than leaving a stray space", () => {
    expect(formatPaddlerName({ name: "Ada", surname: null })).toBe("Ada")
    expect(formatPaddlerName({ name: "", surname: "Lovelace" })).toBe("Lovelace")
  })

  it("falls back to the username when there is no name at all", () => {
    expect(formatPaddlerName({ name: "", surname: null, username: "paddler7" })).toBe("paddler7")
  })

  it("returns an empty string when nothing identifies the paddler", () => {
    expect(formatPaddlerName({ name: "", surname: null })).toBe("")
  })
})

describe("formatVesselLength", () => {
  it("converts centimetres to metres with two decimal places", () => {
    expect(formatVesselLength(520)).toBe("5.20 m")
  })

  it("returns null for null", () => {
    expect(formatVesselLength(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(formatVesselLength(undefined)).toBeNull()
  })

  it("does not drop a legitimate zero", () => {
    // `!cm` treats 0 as absent and silently hides it — must use `== null` instead.
    expect(formatVesselLength(0)).toBe("0.00 m")
  })
})
