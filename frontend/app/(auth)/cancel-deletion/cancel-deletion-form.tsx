"use client"

import { useEffect, useState, useTransition } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cancelDeletion, resendDeletionCancel } from "@/lib/auth/actions"
import Link from "next/link"

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
      const result = await cancelDeletion(token)
      if (result.success) {
        setStatus("success")
        setMessage("Your account deletion has been cancelled. You can now log in again.")
      } else {
        setStatus("error")
        setMessage(result.error)
        setShowResend(true)
      }
    })
  }

  function handleResend() {
    if (!email) return
    startTransition(async () => {
      const result = await resendDeletionCancel(email)
      if (result.success) {
        setStatus("resent")
      } else {
        setStatus("error")
        setMessage(result.error)
      }
    })
  }

  if (status === "success") {
    return (
      <div className="flex flex-col gap-4">
        <p className="auth-notice auth-notice-success">{message}</p>
        <Link href="/login" className="auth-link text-[11px]">
          Sign in
        </Link>
      </div>
    )
  }

  if (status === "resent") {
    return (
      <p className="auth-notice auth-notice-success">
        If that email has a pending deletion request, a new cancellation link is on its way.
      </p>
    )
  }

  if (showResend) {
    return (
      <div className="flex flex-col gap-4">
        {message && <p className="auth-notice auth-notice-error">{message}</p>}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="auth-label">
            Email address
          </label>
          <Input
            id="email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            className="auth-input"
          />
        </div>
        <Button disabled={isPending || !email} onClick={handleResend} className="auth-btn">
          {isPending ? "Sending…" : "Resend cancellation email"}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-[oklch(0.52_0.065_240)]">
        Click below to cancel your deletion request and restore your account.
      </p>
      <Button disabled={isPending} onClick={handleCancel} className="auth-btn">
        {isPending ? "Cancelling…" : "Cancel account deletion"}
      </Button>
    </div>
  )
}
