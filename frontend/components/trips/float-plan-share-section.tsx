"use client"

import { useState, useTransition } from "react"
import { format } from "date-fns"
import {
  CheckIcon,
  LinkIcon,
  MailIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { generateFloatPlanShare, sendFloatPlanShareEmail } from "@/lib/logistics/actions"
import type { Logistics } from "@/lib/dtos/logistics"

interface FloatPlanShareSectionProps {
  tripId: string
  logistics: Logistics | null
}

export function FloatPlanShareSection({
  tripId,
  logistics: initialLogistics,
}: FloatPlanShareSectionProps) {
  const [logistics, setLogistics] = useState(initialLogistics)
  const [copied, setCopied] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false)
  const [showInvalidatedBanner, setShowInvalidatedBanner] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const shareToken = logistics?.shareToken
  const snapshotGeneratedAt = logistics?.snapshotGeneratedAt
  const hasShoreContactEmail = !!logistics?.shoreContactEmail

  function buildPublicUrl(token: string) {
    return `${window.location.origin}/float-plan/${token}`
  }

  function handleCopy() {
    if (!shareToken) return
    navigator.clipboard.writeText(buildPublicUrl(shareToken))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleGenerate() {
    setError(null)
    startTransition(async () => {
      const result = await generateFloatPlanShare(tripId)
      if (result.success) {
        setLogistics(result.logistics)
      } else {
        setError(result.error)
      }
    })
  }

  function handleRegenerate() {
    setShowRegenerateDialog(false)
    setError(null)
    startTransition(async () => {
      const result = await generateFloatPlanShare(tripId)
      if (result.success) {
        setLogistics(result.logistics)
        setShowInvalidatedBanner(true)
        setEmailSent(false)
      } else {
        setError(result.error)
      }
    })
  }

  function handleEmail() {
    setError(null)
    startTransition(async () => {
      const result = await sendFloatPlanShareEmail(tripId)
      if (result.success) {
        setEmailSent(true)
        setTimeout(() => setEmailSent(false), 3000)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {showInvalidatedBanner && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">
            Previous link invalidated — re-send the new link to your shore contact.
          </span>
          <button
            onClick={() => setShowInvalidatedBanner(false)}
            className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!shareToken ? (
        <Button size="sm" onClick={handleGenerate} disabled={isPending} className="w-fit">
          <LinkIcon className="size-3.5" />
          {isPending ? "Generating…" : "Generate float plan link"}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy} disabled={isPending}>
            {copied ? <CheckIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
            {copied ? "Copied!" : "Copy link"}
          </Button>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEmail}
                    disabled={isPending || !hasShoreContactEmail}
                  >
                    {emailSent ? (
                      <CheckIcon className="size-3.5" />
                    ) : (
                      <MailIcon className="size-3.5" />
                    )}
                    {emailSent ? "Sent!" : "Email shore contact"}
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasShoreContactEmail && (
                <TooltipContent>Add a shore contact email first</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowRegenerateDialog(true)}
            disabled={isPending}
          >
            <RefreshCwIcon className="size-3.5" />
            Regenerate
          </Button>
        </div>
      )}

      {snapshotGeneratedAt && (
        <p className="text-muted-foreground text-xs">
          Last generated {format(new Date(snapshotGeneratedAt), "d MMM yyyy 'at' HH:mm")}
        </p>
      )}

      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate float plan link?</DialogTitle>
            <DialogDescription>
              This will invalidate the previous link. Your shore contact must be sent the new link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerate} disabled={isPending}>
              {isPending ? "Regenerating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
