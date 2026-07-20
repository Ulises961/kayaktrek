import { describe, it, expect } from "vitest"
import { deriveMembership } from "../membership"
import type { Trip } from "@/lib/dtos/trip"
import type { Session } from "@/lib/auth/session"

const LEADER_ID = "01952f1a-0000-7000-8000-00000000a001"
const CREW_ID = "01952f1a-0000-7000-8000-00000000a002"
const OUTSIDER_ID = "01952f1a-0000-7000-8000-00000000a003"
const TRIP_ID = "01952f1a-0000-7000-8000-00000000b001"

function session(userId: string): Session {
  return { userId, email: "test@example.com", isAdmin: false }
}

function trip(): Trip {
  return {
    id: TRIP_ID,
    destination: "Test Trip",
    travellers: [
      { id: "member-1", role: "leader", user: { id: LEADER_ID } },
      { id: "member-2", role: "crew", user: { id: CREW_ID } },
    ],
  } as Trip
}

describe("deriveMembership", () => {
  it("identifies the leader", () => {
    const result = deriveMembership(trip(), session(LEADER_ID))
    expect(result.isLeader).toBe(true)
    expect(result.isMember).toBe(true)
    expect(result.leaderId).toBe(LEADER_ID)
  })

  it("identifies a crew member as a member but not the leader", () => {
    const result = deriveMembership(trip(), session(CREW_ID))
    expect(result.isLeader).toBe(false)
    expect(result.isMember).toBe(true)
    expect(result.currentMemberId).toBe("member-2")
  })

  it("treats a non-traveller session as neither leader nor member", () => {
    const result = deriveMembership(trip(), session(OUTSIDER_ID))
    expect(result.isLeader).toBe(false)
    expect(result.isMember).toBe(false)
    expect(result.currentMember).toBeUndefined()
  })

  it("treats no session (anonymous) as neither leader nor member", () => {
    const result = deriveMembership(trip(), null)
    expect(result.isLeader).toBe(false)
    expect(result.isMember).toBe(false)
    expect(result.currentMember).toBeUndefined()
  })

  it("still resolves leaderId with no session", () => {
    const result = deriveMembership(trip(), null)
    expect(result.leaderId).toBe(LEADER_ID)
  })

  it("handles a trip with no travellers at all", () => {
    const emptyTrip = { id: TRIP_ID, destination: "Empty" } as Trip
    const result = deriveMembership(emptyTrip, session(LEADER_ID))
    expect(result.isLeader).toBe(false)
    expect(result.isMember).toBe(false)
    expect(result.leaderId).toBeUndefined()
  })
})
