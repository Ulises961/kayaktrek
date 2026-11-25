import { describe, it, expect } from "vitest"
import type { Connection, ConnectionUser } from "@/lib/dtos/connection"
import { relationshipWith } from "../relationship"

const ME = "01952f1a-0000-7000-8000-000000000001"
const ND1_ID = "01952f1a-0000-7000-8000-00000000000a"

const user = (id: string, username: string): ConnectionUser => ({ id, username, name: username })
const SELF = user(ME, "me")
const ND1 = user(ND1_ID, "nd1")

function connection(overrides: Partial<Connection>): Connection {
  return {
    id: "01952f1a-0000-7000-8000-0000000000c1",
    status: "pending",
    requester: SELF,
    addressee: ND1,
    ...overrides,
  }
}

describe("relationshipWith", () => {
  it("is none, with no connection id, when there is no connection with them", () => {
    expect(relationshipWith(ND1_ID, [], ME)).toEqual({ relationship: "none", connectionId: null })
  })

  it("is pending_outgoing for a request the caller sent that is still pending", () => {
    const sent = connection({ status: "pending", requester: SELF, addressee: ND1 })

    expect(relationshipWith(ND1_ID, [sent], ME)).toEqual({
      relationship: "pending_outgoing",
      connectionId: sent.id,
    })
  })

  it("is pending_incoming for a request sent to the caller, carrying its id to accept", () => {
    const received = connection({ status: "pending", requester: ND1, addressee: SELF })

    expect(relationshipWith(ND1_ID, [received], ME)).toEqual({
      relationship: "pending_incoming",
      connectionId: received.id,
    })
  })

  // The case on the Paddlers page: the request was pending when the search ran, then the other
  // side accepted. The same connection row now says accepted, from whichever side it was sent.
  it("is buddy once the connection is accepted, whichever side sent it", () => {
    const sentByMe = connection({ status: "accepted", requester: SELF, addressee: ND1 })
    const sentToMe = connection({ status: "accepted", requester: ND1, addressee: SELF })

    expect(relationshipWith(ND1_ID, [sentByMe], ME).relationship).toBe("buddy")
    expect(relationshipWith(ND1_ID, [sentToMe], ME).relationship).toBe("buddy")
  })

  it("ignores connections with other people", () => {
    const other = connection({
      status: "accepted",
      requester: SELF,
      addressee: user("01952f1a-0000-7000-8000-00000000000b", "someone-else"),
    })

    expect(relationshipWith(ND1_ID, [other], ME)).toEqual({
      relationship: "none",
      connectionId: null,
    })
  })
})
