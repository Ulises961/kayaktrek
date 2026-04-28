"use client"

import { useState, useTransition } from "react"
import { inviteUser } from "@/lib/trips/actions"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface InviteFormProps {
  tripId: string
}

export function InviteForm({ tripId }: InviteFormProps) {
  const [userId, setUserId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await inviteUser(tripId, userId.trim())
      if (result.success) {
        setUserId("")
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={isPending}
        />
        <Button type="submit" disabled={!userId.trim() || isPending}>
          {isPending ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
