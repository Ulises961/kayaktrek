"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/common/password-input"
import { Label } from "@/components/ui/label"
import { reAuth, requestEmailChange } from "@/lib/profile/actions"

interface EmailChangeSectionProps {
  currentMail: string
  /** Set while a request awaits confirmation via the link sent to this address. */
  pendingMail?: string | null
}

type Phase = "idle" | "authenticating" | "editing" | "pending"

export function EmailChangeSection({ currentMail, pendingMail }: EmailChangeSectionProps) {
  const [phase, setPhase] = useState<Phase>(pendingMail ? "pending" : "idle")
  const [password, setPassword] = useState("")
  const [elevatedToken, setElevatedToken] = useState<string | null>(null)
  const [newMail, setNewMail] = useState("")
  const [pendingDisplay, setPendingDisplay] = useState<string | null>(pendingMail ?? null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleReAuth() {
    setError(null)
    startTransition(async () => {
      const result = await reAuth(password)
      if (!result.success) {
        setError(result.error)
        return
      }
      setElevatedToken(result.elevatedToken)
      setPhase("editing")
    })
  }

  function handleRequestChange() {
    setError(null)
    startTransition(async () => {
      const result = await requestEmailChange(elevatedToken!, newMail)
      if (!result.success) {
        setError(result.error)
        return
      }
      setPendingDisplay(newMail)
      setPhase("pending")
      setPassword("")
      setElevatedToken(null)
    })
  }

  function handleCancel() {
    setPhase("idle")
    setPassword("")
    setError(null)
  }

  if (phase === "pending") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Current email: <span className="font-medium">{currentMail}</span>
        </p>
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
        >
          Pending change to <strong>{pendingDisplay}</strong> — check your inbox to confirm.
        </div>
      </div>
    )
  }

  if (phase === "idle") {
    return (
      // Stacked at base so the address gets the row's full width. An email has no break
      // opportunity, so as a flex child it sets its own min-content width and cannot give
      // ground to the button beside it, which keeps its label.
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <p className="min-w-0 text-sm">
          Current email: <span className="font-medium break-words">{currentMail}</span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setPhase("authenticating")}
        >
          Change email
        </Button>
      </div>
    )
  }

  if (phase === "authenticating") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">Enter your password to continue.</p>
        <div className="flex max-w-sm items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="email-change-password">Password</Label>
            <PasswordInput
              id="email-change-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password) handleReAuth()
              }}
              disabled={isPending}
              autoComplete="current-password"
              autoFocus
            />
          </div>
          <Button type="button" onClick={handleReAuth} disabled={isPending || !password}>
            {isPending ? "Verifying…" : "Continue"}
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
      <div className="flex max-w-sm flex-col gap-1.5">
        <Label htmlFor="new-mail">New email address</Label>
        <Input
          id="new-mail"
          type="email"
          value={newMail}
          onChange={(e) => setNewMail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newMail) handleRequestChange()
          }}
          disabled={isPending}
          autoFocus
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" onClick={handleRequestChange} disabled={isPending || !newMail}>
          {isPending ? "Sending…" : "Send confirmation link"}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
