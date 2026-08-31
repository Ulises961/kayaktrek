"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface NavigateConsentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

// The one thing the "Navigate" toggle doesn't say for itself: turning it on shares live
// location, and the privacy policy's "explicit consent" claim (§2/§3) needs a real informed
// act behind it, not just a browser geolocation prompt asking about OS-level access. Copy
// mirrors Privacy §3 ("makes it available to the other members of that trip, and to the
// trip's designated shore contact where the leader has shared a float plan link") — keep
// them in sync if that section's wording changes.
export function NavigateConsentDialog({
  open,
  onOpenChange,
  onConfirm,
}: NavigateConsentDialogProps) {
  function handleConfirm() {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Share your live position?</AlertDialogTitle>
          <AlertDialogDescription>
            While Navigate is on, your device&rsquo;s location is shared with the other members of
            this trip and, if a float plan link has been shared, with the shore contact. It stops
            the moment you turn Navigate off.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Start sharing</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
