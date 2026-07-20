"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { claimLeadership } from "@/lib/trips/actions"
import { MEMBER_ROLE, type TripMember } from "@/lib/dtos/trip-member"
import { TRIP_STATE } from "@/lib/dtos/trip"

interface LeaderlessTripBannerProps {
  tripId: string
  // Plain string, not TripState — that union excludes "archived" (never
  // frontend-set), but this component must still recognize it (see
  // public-route-detail.tsx's tripState prop for the same precedent).
  tripState?: string | null
  travellers: TripMember[]
  isMember: boolean
  currentMemberId: string | undefined
}

// Shown when a trip has no LEADER TripMember row (the previous leader left, or
// their account was erased) — lets an eligible crew member reclaim it.
export function LeaderlessTripBanner({
  tripId,
  tripState,
  travellers,
  isMember,
  currentMemberId,
}: LeaderlessTripBannerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const hasLeader = travellers.some((m) => m.role === MEMBER_ROLE.LEADER)
  if (hasLeader || tripState === TRIP_STATE.ARCHIVED) return null

  const nominee = travellers.find((m) => m.nominatedSuccessor)
  const isNominee = !!nominee && nominee.id === currentMemberId
  const canClaim = isMember && (!nominee || isNominee)

  function claim() {
    setError(null)
    startTransition(async () => {
      const result = await claimLeadership(tripId)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  const nomineeName = nominee
    ? [nominee.user.name, nominee.user.surname].filter(Boolean).join(" ")
    : null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
        <p>
          This trip has no leader.
          {!canClaim && nomineeName && ` Waiting for ${nomineeName} to claim leadership.`}
          {!canClaim && !nomineeName && " Only a crew member can claim it."}
        </p>
      </div>
      {canClaim && (
        <Button size="sm" className="w-fit" disabled={pending} onClick={claim}>
          Claim leadership
        </Button>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
