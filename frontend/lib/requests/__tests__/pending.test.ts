import { describe, it, expect } from "vitest"
import { buildPendingRequestRows, listsPendingRequests } from "../pending"

describe("listsPendingRequests", () => {
  it.each(["/dashboard", "/invitations", "/paddlers", "/logs"])(
    "is true for %s, where the requests are listed",
    (path) => {
      expect(listsPendingRequests(path)).toBe(true)
    },
  )

  it("is false for a page that lists none, including one that only shares a prefix", () => {
    expect(listsPendingRequests("/trips/abc")).toBe(false)
    expect(listsPendingRequests("/paddlers-hub")).toBe(false)
    expect(listsPendingRequests(null)).toBe(false)
  })

  it("is true below a listing page too", () => {
    expect(listsPendingRequests("/logs/abc")).toBe(true)
  })
})

describe("buildPendingRequestRows", () => {
  it("omits zero-count types", () => {
    const rows = buildPendingRequestRows({
      tripInvitations: 0,
      buddyRequests: 2,
      endorsementRequests: 0,
    })
    expect(rows).toEqual([{ label: "2 buddy requests", href: "/paddlers" }])
  })

  it("singularizes a count of exactly one", () => {
    const rows = buildPendingRequestRows({
      tripInvitations: 1,
      buddyRequests: 0,
      endorsementRequests: 1,
    })
    expect(rows).toEqual([
      { label: "1 trip invitation", href: "/invitations" },
      { label: "1 endorsement request", href: "/logs" },
    ])
  })

  it("returns an empty array when nothing is pending", () => {
    const rows = buildPendingRequestRows({
      tripInvitations: 0,
      buddyRequests: 0,
      endorsementRequests: 0,
    })
    expect(rows).toEqual([])
  })
})
