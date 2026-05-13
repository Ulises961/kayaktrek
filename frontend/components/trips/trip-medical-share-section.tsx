"use client"

import { useState, useTransition } from "react"
import { HeartPulseIcon } from "lucide-react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { reAuth } from "@/lib/profile/actions"
import { shareMedicalNotes } from "@/lib/trip-member/actions"

interface TripMedicalShareSectionProps {
  tripId: string
  sharedAt: string | null
}

export function TripMedicalShareSection({ tripId, sharedAt }: TripMedicalShareSectionProps) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [sharedOk, setSharedOk] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleShare() {
    setError(null)
    setSharedOk(false)
    startTransition(async () => {
      const authResult = await reAuth(password)
      if (!authResult.success) { setError(authResult.error); return }

      const result = await shareMedicalNotes(tripId, authResult.elevatedToken, password)
      if (!result.success) { setError(result.error); return }

      setSharedOk(true)
      setPassword("")
    })
  }

  const formattedDate = sharedAt
    ? (() => { try { return format(new Date(sharedAt), "d MMM yyyy") } catch { return sharedAt } })()
    : null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
        <HeartPulseIcon className="size-4" /> Medical notes
      </p>

      {formattedDate && !sharedOk ? (
        <p className="text-xs text-muted-foreground">
          Last shared with trip leader on {formattedDate}. Enter your password to share an updated copy.
        </p>
      ) : sharedOk ? (
        <p className="text-xs text-green-600 dark:text-green-400">
          Medical notes shared with the trip leader.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Share your encrypted medical notes with the trip leader so they appear on the float plan.
          Notes must be stored first in your{" "}
          <a href="/profile/edit" className="underline underline-offset-2">profile settings</a>.
        </p>
      )}

      {!sharedOk && (
        <div className="flex gap-2 items-end max-w-sm">
          <div className="flex-1 flex flex-col gap-1.5">
            <Label htmlFor="medical-share-password">Password</Label>
            <Input
              id="medical-share-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && password) handleShare() }}
              disabled={isPending}
              autoComplete="current-password"
            />
          </div>
          <Button type="button" onClick={handleShare} disabled={isPending || !password}>
            {isPending ? "Sharing…" : sharedAt ? "Update" : "Share"}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
