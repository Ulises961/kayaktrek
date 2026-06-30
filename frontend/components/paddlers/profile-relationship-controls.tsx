"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserPlusIcon, ClockIcon, CheckIcon, UsersIcon, BanIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getRelationship, requestConnection, acceptConnection } from "@/lib/connections/actions"
import { blockPaddler } from "@/lib/blocks/actions"
import type { Relationship } from "@/lib/dtos/connection"

interface ProfileRelationshipControlsProps {
  username: string
}

// Relationship controls for the public profile header. Resolves the viewer's
// relationship to this paddler on mount; renders nothing when there is no
// actionable surface (own profile, blocked either way, not found).
export function ProfileRelationshipControls({ username }: ProfileRelationshipControlsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<{
    relationship: Relationship
    connectionId?: string | null
  } | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    getRelationship(username).then((result) => {
      if (!active) return
      setState(
        result ? { relationship: result.relationship, connectionId: result.connectionId } : null,
      )
      setLoaded(true)
    })
    return () => {
      active = false
    }
  }, [username])

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.success) setError(result.error ?? "Something went wrong.")
      else router.refresh()
    })
  }

  if (!loaded || !state) return null

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        {state.relationship === "none" && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => requestConnection({ username }))}
          >
            <UserPlusIcon className="size-4" /> Add buddy
          </Button>
        )}
        {state.relationship === "pending_outgoing" && (
          <Button size="sm" variant="ghost" disabled>
            <ClockIcon className="size-4" /> Pending
          </Button>
        )}
        {state.relationship === "pending_incoming" && state.connectionId && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => acceptConnection(state.connectionId!))}
          >
            <CheckIcon className="size-4" /> Accept
          </Button>
        )}
        {state.relationship === "buddy" && (
          <Button size="sm" variant="ghost" disabled>
            <UsersIcon className="size-4" /> Buddies
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => blockPaddler({ username }))}
        >
          <BanIcon className="size-4" /> Block
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
