"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { endorseLog, unendorseLog } from "@/lib/logs/actions"
import { BadgeCheckIcon } from "lucide-react"

interface EndorseButtonProps {
  logId: string
  /** Whether the viewer has already endorsed this log. */
  endorsed: boolean
}

// Terminal endorsement affordance. The forward "endorse a log you haven't yet"
// surface for trip crew lands in M7b; in M7a this drives the withdraw action on
// the Endorsed tab. Surfaces the backend's 403/422 reasons inline.
export function EndorseButton({ logId, endorsed: initialEndorsed }: EndorseButtonProps) {
  const [endorsed, setEndorsed] = useState(initialEndorsed)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    setError(null)
    const next = !endorsed
    startTransition(async () => {
      const result = next ? await endorseLog(logId) : await unendorseLog(logId)
      if (result.success) {
        setEndorsed(next)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={endorsed ? "secondary" : "outline"}
        size="sm"
        disabled={isPending}
        onClick={toggle}
      >
        <BadgeCheckIcon className="size-4" />
        {endorsed ? "Endorsed" : "Endorse"}
      </Button>
      {error && <p className="text-destructive max-w-[16rem] text-right text-xs">{error}</p>}
    </div>
  )
}
