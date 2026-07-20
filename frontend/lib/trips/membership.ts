import type { Trip } from "@/lib/dtos/trip"
import { MEMBER_ROLE, type TripMember } from "@/lib/dtos/trip-member"
import type { Session } from "@/lib/auth/session"

export type Membership = {
  isLeader: boolean
  isMember: boolean
  currentMember?: TripMember
  currentMemberId?: string
  leaderId?: string
}

// The leader/crew/anonymous derivation every trip-detail route segment needs —
// was duplicated independently in trips/[id]/page.tsx and
// trips/[id]/float-plan/page.tsx before the route-segment refactor (M12 §R).
export function deriveMembership(trip: Trip, session: Session | null): Membership {
  const travellers = trip.travellers ?? []
  const leader = travellers.find((m) => m.role === MEMBER_ROLE.LEADER)
  const isLeader = !!session && !!leader && leader.user.id === session.userId
  const currentMember = session ? travellers.find((m) => m.user.id === session.userId) : undefined
  const isMember = !!currentMember

  return {
    isLeader,
    isMember,
    currentMember,
    currentMemberId: currentMember?.id,
    leaderId: leader?.user.id,
  }
}
