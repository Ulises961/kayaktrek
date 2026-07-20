import { describe, it, expect } from "vitest"
import { summarizePending, buildPendingRequestRows } from "../pending"
import type { Trip } from "@/lib/dtos/trip"
import type { Connection } from "@/lib/dtos/connection"
import type { EndorsementRequest } from "@/lib/dtos/endorsement-request"

const CURRENT_USER_ID = "01952f1a-0000-7000-8000-000000000001"
const OTHER_USER_ID = "01952f1a-0000-7000-8000-000000000002"

const invitation = (id: string): Trip => ({ id, destination: "Fjords" }) as Trip

const connection = (status: "pending" | "accepted", addresseeId: string): Connection =>
  ({
    id: `conn-${addresseeId}`,
    status,
    requester: { id: OTHER_USER_ID, username: "other", name: "Other" },
    addressee: { id: addresseeId, username: "me", name: "Me" },
  }) as Connection

const endorsementRequest = (id: string): EndorsementRequest => ({ id }) as EndorsementRequest

describe("summarizePending", () => {
  it("counts trip invitations and endorsement requests directly", () => {
    const result = summarizePending(
      [invitation("t1"), invitation("t2")],
      [],
      [endorsementRequest("e1")],
      CURRENT_USER_ID,
    )
    expect(result.tripInvitations).toBe(2)
    expect(result.endorsementRequests).toBe(1)
  })

  it("counts only connections where the current user is the addressee", () => {
    const connections = [
      connection("pending", CURRENT_USER_ID),
      connection("pending", CURRENT_USER_ID),
      connection("pending", OTHER_USER_ID), // outgoing — caller sent this one
    ]
    const result = summarizePending([], connections, [], CURRENT_USER_ID)
    expect(result.buddyRequests).toBe(2)
  })

  it("returns all zeros for empty inputs", () => {
    const result = summarizePending([], [], [], CURRENT_USER_ID)
    expect(result).toEqual({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })
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
