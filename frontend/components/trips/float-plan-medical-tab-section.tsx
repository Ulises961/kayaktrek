"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reAuth, getMedicalNotes } from "@/lib/profile/actions"
import { getTripMedicalNotes, setTripMedicalNotes, revokeTripMedicalNotes, shareMedicalNotes } from "@/lib/trip-member/actions"

interface FloatPlanMedicalTabSectionProps {
  tripId: string
  hasStoredNotes: boolean
  sharedAt: string | null
}

type Phase = "idle" | "authenticating" | "editing"

export function FloatPlanMedicalTabSection({
  tripId,
  hasStoredNotes,
  sharedAt,
}: FloatPlanMedicalTabSectionProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [password, setPassword] = useState("")
  const [elevatedToken, setElevatedToken] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [hasNotes, setHasNotes] = useState(hasStoredNotes)
  const [isShared, setIsShared] = useState(!!sharedAt)
  const [error, setError] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [shareOk, setShareOk] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDecrypt() {
    setError(null)
    startTransition(async () => {
      const authResult = await reAuth(password)
      if (!authResult.success) { setError(authResult.error); return }

      const token = authResult.elevatedToken

      // Try trip-level notes first; fall back to profile seed if none stored
      const tripResult = await getTripMedicalNotes(tripId, token, password)
      if (!tripResult.success) { setError(tripResult.error); return }

      let initialNotes = tripResult.notes ?? ""
      if (!initialNotes) {
        const profileResult = await getMedicalNotes(token, password)
        if (profileResult.success) {
          initialNotes = profileResult.notes ?? ""
        }
      }

      setElevatedToken(token)
      setNotes(initialNotes)
      setPhase("editing")
    })
  }

  function handleSave() {
    setError(null)
    setSavedOk(false)
    startTransition(async () => {
      const result = await setTripMedicalNotes(tripId, notes, elevatedToken!, password)
      if (!result.success) { setError(result.error); return }
      setHasNotes(true)
      setSavedOk(true)
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await revokeTripMedicalNotes(tripId, elevatedToken!)
      if (!result.success) { setError(result.error); return }
      setHasNotes(false)
      setIsShared(false)
      setNotes("")
      setElevatedToken(null)
      setPassword("")
      setPhase("idle")
    })
  }

  function handleShare() {
    setShareError(null)
    setShareOk(false)
    startTransition(async () => {
      const result = await shareMedicalNotes(tripId, elevatedToken!, password)
      if (!result.success) { setShareError(result.error); return }
      setIsShared(true)
      setShareOk(true)
    })
  }

  function handleDone() {
    setPhase("idle")
    setElevatedToken(null)
    setPassword("")
    setNotes("")
    setError(null)
    setShareError(null)
    setShareOk(false)
  }

  function handleCancel() {
    setPhase("idle")
    setPassword("")
    setError(null)
  }

  if (phase === "idle") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {hasNotes
              ? "Notes stored — encrypted for this trip."
              : "No notes stored yet. Add allergies, medications, blood type, or anything relevant to rescue crews."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setPhase("authenticating")}
          >
            {hasNotes ? "Edit" : "Add notes"}
          </Button>
        </div>
        {hasNotes && (
          <p className="text-xs text-muted-foreground">
            {isShared
              ? "Shared with trip leader."
              : "Not shared with trip leader."}
          </p>
        )}
      </div>
    )
  }

  if (phase === "authenticating") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Enter your password to decrypt your notes.
        </p>
        <div className="flex gap-2 items-end max-w-sm">
          <div className="flex-1 flex flex-col gap-1.5">
            <Label htmlFor="fp-medical-password">Password</Label>
            <Input
              id="fp-medical-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && password) handleDecrypt() }}
              disabled={isPending}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <Button type="button" onClick={handleDecrypt} disabled={isPending || !password}>
            {isPending ? "Decrypting…" : "Continue"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="button"
          onClick={handleCancel}
          className="text-xs text-muted-foreground hover:text-foreground w-fit"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setSavedOk(false) }}
        placeholder="Allergies, medications, blood type, conditions relevant to rescue crews…"
        rows={4}
        disabled={isPending}
        autoFocus
      />
      <div className="flex gap-2 flex-wrap items-center">
        <Button type="button" onClick={handleSave} disabled={isPending || !notes.trim()}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={handleDone} disabled={isPending}>
          Done
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleShare}
          disabled={isPending || !hasNotes}
          className="ml-auto"
        >
          Share with trip leader
        </Button>
        {hasNotes && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={handleDelete}
            disabled={isPending}
          >
            Delete notes
          </Button>
        )}
      </div>
      {savedOk && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}
      {shareOk && <p className="text-xs text-green-600 dark:text-green-400">Shared with trip leader.</p>}
      {shareError && <p className="text-xs text-destructive">{shareError}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
