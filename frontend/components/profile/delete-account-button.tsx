"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { requestAccountDeletion } from "@/lib/profile/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function DeleteAccountButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    startTransition(async () => {
      const result = await requestAccountDeletion()
      if (result.success) {
        setOpen(false)
        router.push("/login?deleted=1")
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* "Request deletion" at base, the full phrase from sm. This sits inside the
            danger-zone box's own p-4 as well as the card's px-6, which leaves 221px at 320
            — less than the full label needs.
            `sr-only` rather than `hidden` keeps the dropped word in the accessibility tree,
            and the explicit aria-label is what makes the name reliable: the accessible-name
            algorithm trims each element's text before joining, so a space living inside the
            span is discarded and the name computes as "Requestaccount deletion". Same
            pairing as ImportGpxButton. */}
        <Button variant="destructive" size="sm" aria-label="Request account deletion">
          Request<span className="sr-only sm:not-sr-only"> account</span> deletion
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request account deletion</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-3 text-sm">
              <p>
                Your account will be deactivated immediately and permanently deleted after 30 days.
              </p>
              <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4">
                <li>You will be logged out and unable to sign in during the grace period.</li>
                <li>You will receive an email with a link to cancel within 30 days.</li>
                <li>Trips you lead will be preserved with your name anonymised.</li>
                <li>Your personal data, logs, and float plan information will be removed.</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={isPending} onClick={handleConfirm}>
            {isPending ? "Processing…" : "Yes, delete my account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
