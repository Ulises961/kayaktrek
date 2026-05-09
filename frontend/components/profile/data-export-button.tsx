"use client"

import { useState, useTransition } from "react"
import { requestDataExport } from "@/lib/profile/actions"
import { Button } from "@/components/ui/button"
import { DownloadIcon } from "lucide-react"

export function DataExportButton() {
  const [isPending, startTransition] = useTransition()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    startTransition(async () => {
      const result = await requestDataExport()
      if (result.success) {
        setSent(true)
      } else {
        setError(result.error)
      }
    })
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        A download link has been sent to your email address.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" size="sm" disabled={isPending} onClick={handleClick} className="self-start">
        <DownloadIcon className="size-4" />
        {isPending ? "Requesting…" : "Download my data"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
