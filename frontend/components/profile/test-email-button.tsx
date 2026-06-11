"use client"

import { useState, useTransition } from "react"
import { sendTestEmail } from "@/lib/profile/actions"
import { Button } from "@/components/ui/button"
import { MailIcon } from "lucide-react"

export function TestEmailButton() {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setSent(false)
    setError(null)
    startTransition(async () => {
      const result = await sendTestEmail()
      if (result.success) {
        setSent(true)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={handleClick}
        className="self-start"
      >
        <MailIcon className="size-4" />
        {isPending ? "Sending…" : sent ? "Sent — check inbox" : "Send test email"}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
