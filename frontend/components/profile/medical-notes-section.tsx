"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  reAuth,
  getMedicalNotes,
  grantMedicalConsent,
  revokeMedicalConsent,
} from "@/lib/profile/actions"

interface MedicalNotesSectionProps {
  hasStoredNotes: boolean
}

type Phase = "idle" | "authenticating" | "editing"

export function MedicalNotesSection({ hasStoredNotes }: MedicalNotesSectionProps) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [password, setPassword] = useState("")
  const [elevatedToken, setElevatedToken] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [hasNotes, setHasNotes] = useState(hasStoredNotes)
  const [error, setError] = useState<string | null>(null)
  const [savedOk, setSavedOk] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDecrypt() {
    setError(null)
    startTransition(async () => {
      const authResult = await reAuth(password)
      if (!authResult.success) {
        setError(authResult.error)
        return
      }

      const notesResult = await getMedicalNotes(authResult.elevatedToken, password)
      if (!notesResult.success) {
        setError(notesResult.error)
        return
      }

      setElevatedToken(authResult.elevatedToken)
      setNotes(notesResult.notes ?? "")
      setPhase("editing")
    })
  }

  function handleSave() {
    setError(null)
    setSavedOk(false)
    startTransition(async () => {
      const result = await grantMedicalConsent(elevatedToken!, notes, password)
      if (!result.success) {
        setError(result.error)
        return
      }
      setHasNotes(true)
      setSavedOk(true)
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await revokeMedicalConsent(elevatedToken!)
      if (!result.success) {
        setError(result.error)
        return
      }
      setHasNotes(false)
      setNotes("")
      setElevatedToken(null)
      setPassword("")
      setPhase("idle")
    })
  }

  function handleDone() {
    setPhase("idle")
    setElevatedToken(null)
    setPassword("")
    setNotes("")
    setError(null)
    setSavedOk(false)
  }

  function handleCancel() {
    setPhase("idle")
    setPassword("")
    setError(null)
  }

  if (phase === "idle") {
    return (
      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          {hasNotes
            ? "Notes stored — encrypted on your account."
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
    )
  }

  if (phase === "authenticating") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">Enter your password to decrypt your notes.</p>
        <div className="flex max-w-sm items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="medical-unlock-password">Password</Label>
            <Input
              id="medical-unlock-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password) handleDecrypt()
              }}
              disabled={isPending}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <Button type="button" onClick={handleDecrypt} disabled={isPending || !password}>
            {isPending ? "Decrypting…" : "Continue"}
          </Button>
        </div>
        {error && <p className="text-destructive text-xs">{error}</p>}
        <button
          type="button"
          onClick={handleCancel}
          className="text-muted-foreground hover:text-foreground w-fit text-xs"
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
        onChange={(e) => {
          setNotes(e.target.value)
          setSavedOk(false)
        }}
        placeholder="Allergies, medications, blood type, conditions relevant to rescue crews…"
        rows={5}
        disabled={isPending}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSave} disabled={isPending || !notes.trim()}>
          {isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={handleDone} disabled={isPending}>
          Done
        </Button>
        {hasNotes && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive ml-auto"
            onClick={handleDelete}
            disabled={isPending}
          >
            Delete notes
          </Button>
        )}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {savedOk && <p className="text-xs text-green-600 dark:text-green-400">Saved.</p>}
    </div>
  )
}
