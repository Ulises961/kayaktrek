import { describe, it, expect } from "vitest"
import { NOTIFICATION_KIND } from "@/lib/dtos/pending-requests"
import {
  badgeTotal,
  buildNotificationRows,
  buildPendingRequestRows,
  EMPTY_PENDING_SUMMARY,
  listsPendingRequests,
} from "../pending"

describe("badgeTotal", () => {
  it("adds what is waiting on the user to the answers they have not seen", () => {
    expect(
      badgeTotal({
        tripInvitations: 1,
        buddyRequests: 2,
        endorsementRequests: 3,
        acceptedTripInvitations: 4,
        acceptedBuddyRequests: 5,
      }),
    ).toBe(15)
  })

  it("is zero for an empty summary", () => {
    expect(badgeTotal(EMPTY_PENDING_SUMMARY)).toBe(0)
  })
})

describe("buildNotificationRows", () => {
  it("has no rows when nothing has been answered", () => {
    expect(buildNotificationRows({ acceptedTripInvitations: 0, acceptedBuddyRequests: 0 })).toEqual(
      [],
    )
  })

  it("says what was accepted, links to where it shows, and names the kind it clears", () => {
    expect(buildNotificationRows({ acceptedTripInvitations: 2, acceptedBuddyRequests: 1 })).toEqual(
      [
        {
          label: "2 trip invitations accepted",
          href: "/trips",
          clears: NOTIFICATION_KIND.TRIP_INVITATION_ACCEPTED,
        },
        {
          label: "1 buddy request accepted",
          href: "/paddlers",
          clears: NOTIFICATION_KIND.BUDDY_REQUEST_ACCEPTED,
        },
      ],
    )
  })

  it("singularises a count of exactly one", () => {
    const [row] = buildNotificationRows({ acceptedTripInvitations: 1, acceptedBuddyRequests: 0 })

    expect(row.label).toBe("1 trip invitation accepted")
  })
})

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
