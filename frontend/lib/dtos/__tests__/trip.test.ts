import { describe, it, expect } from "vitest"
import { TripMemberSchema } from "../trip-member"
import { TripSchema, TripPageSchema } from "../trip"

const MEMBER_USER = {
  id: "01952f1a-0000-7000-8000-000000000001",
  mail: "leader@example.com",
  username: "leader",
  name: "Ada",
  surname: "Lovelace",
  phone: "+34600000001",
}

const LEADER_MEMBER = {
  id: "01952f1a-0000-7000-8000-000000000002",
  role: "leader",
  user: MEMBER_USER,
}

const CREW_MEMBER = {
  id: "01952f1a-0000-7000-8000-000000000003",
  role: "crew",
  user: { ...MEMBER_USER, id: "01952f1a-0000-7000-8000-000000000004", mail: "crew@example.com", username: "crew" },
}

const TRIP_FIXTURE = {
  id: "01952f1a-0000-7000-8000-000000000010",
  state: "planning",
  destination: "Costa Brava",
  description: "Five days along the coast",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-05",
  travellers: [LEADER_MEMBER, CREW_MEMBER],
  pendingTravellers: [MEMBER_USER],
}

describe("TripMemberSchema", () => {
  it("parses a leader member", () => {
    const result = TripMemberSchema.safeParse(LEADER_MEMBER)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe("leader")
      expect(result.data.user.username).toBe("leader")
    }
  })

  it("parses a crew member", () => {
    const result = TripMemberSchema.safeParse(CREW_MEMBER)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.role).toBe("crew")
  })

  it("rejects an unknown role", () => {
    const result = TripMemberSchema.safeParse({ ...LEADER_MEMBER, role: "passenger" })
    expect(result.success).toBe(false)
  })

  it("rejects a member without a user", () => {
    const { user: _, ...noUser } = LEADER_MEMBER
    const result = TripMemberSchema.safeParse(noUser)
    expect(result.success).toBe(false)
  })
})

describe("TripSchema", () => {
  it("parses a full trip fixture", () => {
    const result = TripSchema.safeParse(TRIP_FIXTURE)
    expect(result.success).toBe(true)
  })

  it("accepts all valid states", () => {
    for (const state of ["draft", "planning", "happening", "past"] as const) {
      const result = TripSchema.safeParse({ ...TRIP_FIXTURE, state })
      expect(result.success).toBe(true)
    }
  })

  it("rejects an invalid state", () => {
    const result = TripSchema.safeParse({ ...TRIP_FIXTURE, state: "archived" })
    expect(result.success).toBe(false)
  })

  it("travellers are parsed as TripMember (role + user)", () => {
    const result = TripSchema.safeParse(TRIP_FIXTURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.travellers?.[0]).toHaveProperty("role")
      expect(result.data.travellers?.[0]).toHaveProperty("user")
    }
  })

  it("accepts a trip with no optional fields", () => {
    const result = TripSchema.safeParse({ id: TRIP_FIXTURE.id })
    expect(result.success).toBe(true)
  })
})

describe("TripPageSchema", () => {
  const page = {
    items: [TRIP_FIXTURE],
    total: 1,
    page: 1,
    pages: 1,
  }

  it("parses a paginated trip response", () => {
    const result = TripPageSchema.safeParse(page)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.total).toBe(1)
      expect(result.data.items).toHaveLength(1)
    }
  })

  it("rejects a response missing total", () => {
    const { total: _, ...noTotal } = page
    const result = TripPageSchema.safeParse(noTotal)
    expect(result.success).toBe(false)
  })

  it("rejects a response missing items", () => {
    const { items: _, ...noItems } = page
    const result = TripPageSchema.safeParse(noItems)
    expect(result.success).toBe(false)
  })
})
