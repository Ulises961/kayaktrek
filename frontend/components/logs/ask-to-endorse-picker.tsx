"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BadgeCheckIcon } from "lucide-react"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getTripCrew } from "@/lib/trips/actions"
import { requestEndorsement } from "@/lib/endorsement-requests/actions"
import type { TripMember } from "@/lib/dtos/trip-member"

interface AskToEndorsePickerProps {
  logId: string
  tripId: string
  // The log author (current user) — excluded; you can't ask yourself.
  authorId: string
  // Ids of paddlers who already endorsed — excluded.
  endorserIds: string[]
}

// Author-initiated affordance: pick a trip-mate to ask for an endorsement of this
// trip-linked log. Candidates are the trip crew minus self minus existing endorsers.
export function AskToEndorsePicker({
  logId,
  tripId,
  authorId,
  endorserIds,
}: AskToEndorsePickerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [crew, setCrew] = useState<TripMember[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [asked, setAsked] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || loaded) return
    getTripCrew(tripId).then((members) => {
      setCrew(members)
      setLoaded(true)
    })
  }, [open, loaded, tripId])

  const excluded = new Set([authorId, ...endorserIds])
  const candidates = crew.filter((m) => m.user.id && !excluded.has(m.user.id))

  function ask(member: TripMember) {
    const userId = member.user.id!
    setError(null)
    startTransition(async () => {
      const result = await requestEndorsement(logId, { userId })
      if (!result.success) setError(result.error)
      else {
        setAsked((prev) => new Set(prev).add(userId))
        router.refresh()
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BadgeCheckIcon className="size-4" /> Ask to endorse
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        {!loaded ? (
          <p className="text-muted-foreground p-2 text-sm">Loading crew…</p>
        ) : candidates.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">No trip-mates left to ask.</p>
        ) : (
          <ul className="flex flex-col">
            {candidates.map((member) => {
              const user = member.user
              const alreadyAsked = asked.has(user.id!)
              return (
                <li key={user.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending || alreadyAsked}
                    onClick={() => ask(member)}
                    className="hover:bg-accent flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50"
                  >
                    <UserAvatar
                      name={user.name}
                      surname={user.surname}
                      imageUrl={user.avatarUrl}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {[user.name, user.surname].filter(Boolean).join(" ")}
                    </span>
                    {alreadyAsked && <span className="text-muted-foreground text-xs">Asked</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {error && <p className="text-destructive px-2 pt-1 text-xs">{error}</p>}
      </PopoverContent>
    </Popover>
  )
}
