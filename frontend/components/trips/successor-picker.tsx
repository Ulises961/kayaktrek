"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserPlusIcon, XIcon } from "lucide-react"
import { UserAvatar } from "@/components/common/user-avatar"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { nominateSuccessor, clearNomination } from "@/lib/trips/actions"
import { MEMBER_ROLE, type TripMember } from "@/lib/dtos/trip-member"

interface SuccessorPickerProps {
  tripId: string
  // All travellers on the trip, including the leader (filtered internally).
  travellers: TripMember[]
}

// Leader-only affordance: designate one crew member as the trip's successor,
// consulted by the claim-leadership flow if this leader ever leaves.
export function SuccessorPicker({ tripId, travellers }: SuccessorPickerProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const crew = travellers.filter((m) => m.role === MEMBER_ROLE.CREW)
  const nominee = crew.find((m) => m.nominatedSuccessor)

  function nominate(member: TripMember) {
    setError(null)
    startTransition(async () => {
      const result = await nominateSuccessor(tripId, member.user.id!)
      if (!result.success) setError(result.error)
      else {
        setOpen(false)
        router.refresh()
      }
    })
  }

  function clear() {
    setError(null)
    startTransition(async () => {
      const result = await clearNomination(tripId)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  if (crew.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {nominee ? (
        <div className="flex items-center gap-2 text-sm">
          <UserAvatar
            name={nominee.user.name}
            surname={nominee.user.surname}
            imageUrl={nominee.user.avatarUrl}
            size="sm"
          />
          <span className="min-w-0 flex-1 truncate">
            {[nominee.user.name, nominee.user.surname].filter(Boolean).join(" ")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear nomination"
            className="size-6"
            disabled={pending}
            onClick={clear}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-fit">
              <UserPlusIcon className="size-3.5" />
              Nominate a successor
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <ul className="flex flex-col">
              {crew.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => nominate(member)}
                    className="hover:bg-secondary flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-50"
                  >
                    <UserAvatar
                      name={member.user.name}
                      surname={member.user.surname}
                      imageUrl={member.user.avatarUrl}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {[member.user.name, member.user.surname].filter(Boolean).join(" ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
