"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/common/password-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reAuth, getMedicalNotes } from "@/lib/profile/actions"
import {
  getTripMedicalNotes,
  setTripMedicalNotes,
  revokeTripMedicalNotes,
  getLeaderPublicKey,
  shareMedicalNotes,
} from "@/lib/trip-member/actions"
import { decrypt, encrypt, encryptForRecipient } from "@/lib/crypto/medical"
import { EmptyState } from "@/components/common/empty-state"

interface FloatPlanMedicalTabSectionProps {
  tripId: string
  hasStoredNotes: boolean
  sharedAt: string | null
  /** Set when a password reset wiped the user's notes — prompts re-entry. */
  profileResetAt?: string | null
}

type Phase = "idle" | "authenticating" | "editing"

export function FloatPlanMedicalTabSection({
  tripId,
  hasStoredNotes,
  sharedAt,
  profileResetAt,
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

  // The prompt clears once notes are re-entered (hasNotes flips true after a save).
  const showResetPrompt = !!profileResetAt && !hasNotes

  // The password never leaves this component (M22): re-auth proves identity to the server,
  // which returns ciphertext, and the decryption happens here.
  function handleDecrypt() {
    setError(null)
    startTransition(async () => {
      const authResult = await reAuth(password)
      if (!authResult.success) {
        setError(authResult.error)
        return
      }

      const token = authResult.elevatedToken

      // Try trip-level notes first; fall back to profile seed if none stored
      const tripResult = await getTripMedicalNotes(tripId, token)
      if (!tripResult.success) {
        setError(tripResult.error)
        return
      }

      let sealed = tripResult.sealed
      if (!sealed) {
        const profileResult = await getMedicalNotes(token)
        if (profileResult.success) sealed = profileResult.sealed
      }

      let initialNotes = ""
      if (sealed) {
        try {
          initialNotes = await decrypt(sealed.ciphertext, sealed.nonce, sealed.salt, password)
        } catch {
          // reAuth accepted this password, so the notes were sealed under a different
          // one. Nothing here can recover them; overwriting is the only way forward.
          setError(
            "Could not decrypt notes — they were saved with a different password. " +
              "Re-enter them to replace what is stored.",
          )
          setElevatedToken(token)
          setPhase("editing")
          return
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
      const sealed = await encrypt(notes, password)
      const result = await setTripMedicalNotes(tripId, elevatedToken!, sealed)
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
      const result = await revokeTripMedicalNotes(tripId, elevatedToken!)
      if (!result.success) {
        setError(result.error)
        return
      }
      setHasNotes(false)
      setIsShared(false)
      setNotes("")
      setElevatedToken(null)
      setPassword("")
      setPhase("idle")
    })
  }

  // Sharing seals a second copy for the leader, on this device. The notes being shared are
  // the ones in the editor, which is why this is only reachable from the editing phase —
  // the server no longer holds anything it could re-encrypt on our behalf.
  function handleShare() {
    setShareError(null)
    setShareOk(false)
    startTransition(async () => {
      const keyResult = await getLeaderPublicKey(tripId)
      if (!keyResult.success) {
        setShareError(keyResult.error)
        return
      }
      const forLeader = encryptForRecipient(notes, keyResult.publicKey)
      const result = await shareMedicalNotes(tripId, elevatedToken!, {
        ciphertext: forLeader.ciphertext,
        nonce: forLeader.nonce,
        ephemeralKey: forLeader.ephemeralPublicKey,
      })
      if (!result.success) {
        setShareError(result.error)
        return
      }
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
        {showResetPrompt && (
          <div
            role="alert"
            className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            Your medical notes were removed when you reset your password. Re-enter them here (or on
            your profile) so they are available for this trip&apos;s float plan.
          </div>
        )}
        <div className="flex items-center justify-between gap-4">
          {hasNotes ? (
            <p className="text-muted-foreground text-sm">Notes stored — encrypted for this trip.</p>
          ) : (
            <EmptyState
              variant="inline"
              title="No notes stored yet."
              description="Add allergies, medications, blood type, or anything relevant to rescue crews."
            />
          )}
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
          <p className="text-muted-foreground text-xs">
            {isShared ? "Shared with trip leader." : "Not shared with trip leader."}
          </p>
        )}
      </div>
    )
  }

  if (phase === "authenticating") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">Enter your password to decrypt your notes.</p>
        <div className="flex max-w-sm items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="fp-medical-password">Password</Label>
            <PasswordInput
              id="fp-medical-password"
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
        rows={4}
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
      {shareOk && (
        <p className="text-xs text-green-600 dark:text-green-400">Shared with trip leader.</p>
      )}
      {shareError && <p className="text-destructive text-xs">{shareError}</p>}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
