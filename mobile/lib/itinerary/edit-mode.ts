import { TRIP_STATE } from "@shared/dtos/trip"

// Sent to the point screen by the itinerary when it is in view mode, so a leader who opens a point
// to read its notes or photos gets the read-only view, not the edit form.
export const READ_ONLY_PARAM = "1"

// Whether the itinerary screen offers its Edit button: the trip's leader, while the trip is being
// built or is under way. Web's builder locks edit mode once a trip is past; the server refuses the
// same edits, so this only decides what to offer. A state the phone has never cached counts as
// "not editable" — hiding a button is recoverable, offering an edit on a trip that is over is not.
export function canEditRoute({
  isLeader,
  tripState,
}: {
  isLeader: boolean
  tripState: string | null
}): boolean {
  return isLeader && (tripState === TRIP_STATE.BUILDING || tripState === TRIP_STATE.HAPPENING)
}
