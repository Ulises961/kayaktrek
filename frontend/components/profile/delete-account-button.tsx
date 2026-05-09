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
        <Button variant="destructive" size="sm">Request account deletion</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request account deletion</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-3 text-sm">
              <p>Your account will be deactivated immediately and permanently deleted after 30 days.</p>
              <ul className="list-disc pl-4 flex flex-col gap-1 text-muted-foreground">
                <li>You will be logged out and unable to sign in during the grace period.</li>
                <li>You will receive an email with a link to cancel within 30 days.</li>
                <li>Trips you lead will be preserved with your name anonymised.</li>
                <li>Your personal data, logs, and float plan information will be removed.</li>
              </ul>
            </div>
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
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
