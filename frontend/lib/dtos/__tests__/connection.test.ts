import { describe, it, expect } from "vitest"
import { ConnectionSchema, RelationshipSchema } from "../connection"

const USER_A = {
  id: "01952f1a-0000-7000-8000-000000000001",
  username: "alice",
  name: "Alice",
  surname: "Adams",
  avatarUrl: "https://cdn.example.com/a.png",
}

const USER_B = {
  id: "01952f1a-0000-7000-8000-000000000002",
  username: "bob",
  name: "Bob",
  surname: null,
  avatarUrl: null,
}

const CONNECTION_FIXTURE = {
  id: "01952f1a-0000-7000-8000-0000000000aa",
  status: "pending",
  created: "2026-06-28T10:00:00",
  respondedAt: null,
  requester: USER_A,
  addressee: USER_B,
}

describe("ConnectionSchema", () => {
  it("parses a pending connection fixture", () => {
    expect(ConnectionSchema.safeParse(CONNECTION_FIXTURE).success).toBe(true)
  })

  it("parses an accepted connection with respondedAt", () => {
    const result = ConnectionSchema.safeParse({
      ...CONNECTION_FIXTURE,
      status: "accepted",
      respondedAt: "2026-06-28T11:00:00",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown status", () => {
    expect(ConnectionSchema.safeParse({ ...CONNECTION_FIXTURE, status: "declined" }).success).toBe(
      false,
    )
  })

  it("requires both parties", () => {
    const { addressee: _addressee, ...withoutAddressee } = CONNECTION_FIXTURE
    void _addressee
    expect(ConnectionSchema.safeParse(withoutAddressee).success).toBe(false)
  })
})

describe("RelationshipSchema", () => {
  it("accepts the four relationship states", () => {
    for (const value of ["none", "pending_outgoing", "pending_incoming", "buddy"]) {
      expect(RelationshipSchema.safeParse(value).success).toBe(true)
    }
  })

  it("rejects anything else", () => {
    expect(RelationshipSchema.safeParse("friends").success).toBe(false)
  })
})
