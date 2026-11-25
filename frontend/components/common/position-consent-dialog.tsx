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

// Where a shared position comes from: the phone's own GPS (Navigate mode) or the paddler's
// inReach feed, switched on per trip (M29).
export const POSITION_SOURCE = { DEVICE: "device", INREACH: "inreach" } as const
export type PositionSource = (typeof POSITION_SOURCE)[keyof typeof POSITION_SOURCE]

const COPY: Record<PositionSource, { title: string; description: string }> = {
  [POSITION_SOURCE.DEVICE]: {
    title: "Share your live position?",
    description:
      "While you are sharing, your device’s location is shared with the other members of this trip and, if a float plan link has been shared, with the shore contact. It stops the moment you stop sharing or turn Navigate off. You can watch the crew without sharing.",
  },
  [POSITION_SOURCE.INREACH]: {
    title: "Share your inReach position?",
    description:
      "While the trip is under way, your inReach position is posted to it about every 10 minutes. The other members of this trip see it and, if a float plan link has been shared, so does the shore contact. It stops when you turn this off or leave the trip.",
  },
}

interface PositionConsentDialogProps {
  source: PositionSource
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

// The one thing the control that starts sharing doesn't say for itself: turning it on shares
// live location, and the privacy policy's "explicit consent" claim (§2/§3) needs a real
// informed act behind it, not just a browser geolocation prompt asking about OS-level access.
// Both copies mirror Privacy §3 ("makes it available to the other members of that trip, and to
// the trip's designated shore contact where the leader has shared a float plan link") — keep
// them in sync if that section's wording changes.
export function PositionConsentDialog({
  source,
  open,
  onOpenChange,
  onConfirm,
}: PositionConsentDialogProps) {
  const { title, description } = COPY[source]

  function handleConfirm() {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>Start sharing</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
