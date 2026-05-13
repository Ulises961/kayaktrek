"use client"

import { useState, useTransition } from "react"
import { LockIcon, LockOpenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reAuth, getMedicalNotes, grantMedicalConsent, revokeMedicalConsent } from "@/lib/profile/actions"

interface MedicalNotesSectionProps {
  hasStoredNotes: boolean
}

type Phase = "locked" | "unlocked"

export function MedicalNotesSection({ hasStoredNotes }: MedicalNotesSectionProps) {
  const [phase, setPhase] = useState<Phase>("locked")
  const [password, setPassword] = useState("")
  const [elevatedToken, setElevatedToken] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [hasNotes, setHasNotes] = useState(hasStoredNotes)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleUnlock() {
    setError(null)
    startTransition(async () => {
      const authResult = await reAuth(password)
      if (!authResult.success) { setError(authResult.error); return }

      const notesResult = await getMedicalNotes(authResult.elevatedToken, password)
      if (!notesResult.success) { setError(notesResult.error); return }

      setElevatedToken(authResult.elevatedToken)
      setNotes(notesResult.notes ?? "")
      setPhase("unlocked")
    })
  }

  function handleSave() {
    setError(null)
    setSavedOk(false)
    startTransition(async () => {
      const result = await grantMedicalConsent(elevatedToken!, notes, password)
      if (!result.success) { setError(result.error); return }
      setHasNotes(true)
      setSavedOk(true)
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await revokeMedicalConsent(elevatedToken!)
      if (!result.success) { setError(result.error); return }
      setHasNotes(false)
      setNotes("")
      setElevatedToken(null)
      setPassword("")
      setPhase("locked")
    })
  }

  function handleLock() {
    setPhase("locked")
    setElevatedToken(null)
    setPassword("")
    setNotes("")
    setError(null)
    setSavedOk(false)
  }

  if (phase === "locked") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <LockIcon className="size-4" /> Medical notes
        </p>
        <p className="text-xs text-muted-foreground -mt-2">
          {hasNotes
            ? "Notes are stored encrypted. Enter your password to view or edit them."
            : "Store private medical information (allergies, medications, blood type) encrypted on your account. You can share it with trip leaders on a per-trip basis."}
        </p>
        <div className="flex gap-2 items-end max-w-sm">
          <div className="flex-1 flex flex-col gap-1.5">
            <Label htmlFor="medical-unlock-password">Password</Label>
            <Input
              id="medical-unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && password) handleUnlock() }}
              disabled={isPending}
              autoComplete="current-password"
            />
          </div>
          <Button type="button" onClick={handleUnlock} disabled={isPending || !password}>
            {isPending ? "Unlocking…" : "Unlock"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
          <LockOpenIcon className="size-4" /> Medical notes
          <span className="text-xs font-normal text-green-600 dark:text-green-400">unlocked</span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={handleLock} disabled={isPending}>
          Lock
        </Button>
      </div>

      <Textarea
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setSavedOk(false) }}
        placeholder="Allergies, medications, blood type, conditions relevant to rescue crews…"
        rows={4}
        disabled={isPending}
      />

      <div className="flex gap-2 flex-wrap">
        <Button type="button" onClick={handleSave} disabled={isPending || !notes.trim()}>
          {isPending ? "Saving…" : "Save notes"}
        </Button>
        {hasNotes && (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
            Delete notes
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {savedOk && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}
    </div>
  )
}
