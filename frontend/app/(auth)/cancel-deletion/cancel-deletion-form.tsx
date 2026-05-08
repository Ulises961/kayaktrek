"use client"

import { useEffect, useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { API_URL } from "@/lib/api/config"

export function CancelDeletionForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error" | "resent">("idle")
  const [message, setMessage] = useState<string | null>(null)
  const [showResend, setShowResend] = useState(!token)
  const [email, setEmail] = useState("")

  useEffect(() => {
    if (token) handleCancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCancel() {
    startTransition(async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/user/me/deletion-request?token=${encodeURIComponent(token)}`,
          { method: "DELETE" }
        )
        if (res.ok) {
          setStatus("success")
          setMessage("Your account deletion has been cancelled. You can now log in again.")
        } else {
          // Inner catch: body may not be JSON (plain text, empty, HTML error page)
          const body = await res.json().catch(() => ({}))
          setStatus("error")
          setMessage(body?.description ?? "The cancellation link is invalid or has expired.")
          setShowResend(true)
        }
      } catch {
        setStatus("error")
        setMessage("Could not reach the server. Please try again.")
        setShowResend(true)
      }
    })
  }

  function handleResend() {
    if (!email) return
    startTransition(async () => {
      try {
        await fetch(`${API_URL}/api/auth/resend-deletion-cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mail: email }),
        })
        setStatus("resent")
      } catch {
        setStatus("error")
        setMessage("Could not reach the server. Please try again.")
      }
    })
  }

  if (status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          {message}
        </p>
        <Button asChild variant="outline" size="sm">
          <a href="/login">Sign in</a>
        </Button>
      </div>
    )
  }

  if (status === "resent") {
    return (
      <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
        If that email has a pending deletion request, a new cancellation link is on its way.
      </p>
    )
  }

  if (showResend) {
    return (
      <div className="flex flex-col gap-4">
        {message && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {message}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
          />
        </div>
        <Button disabled={isPending || !email} onClick={handleResend}>
          {isPending ? "Sending…" : "Resend cancellation email"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600">
        Click below to cancel your deletion request and restore your account.
      </p>
      <Button disabled={isPending} onClick={handleCancel}>
        {isPending ? "Cancelling…" : "Cancel account deletion"}
      </Button>
    </div>
  )
}
