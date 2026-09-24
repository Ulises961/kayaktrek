import { createContext, useContext } from "react"

import type { QueuedMutation } from "../db/mutation-queue"

// What the phone has queued to send (M9d): read by every Screen's notice and by
// sign-out. Kept apart from the provider that observes the local database
// (lib/db/queued-changes-provider.tsx) so that reading it pulls no database into
// a screen — or into a screen's test. Outside the provider, nothing is queued.
export type QueuedChanges = {
  pending: QueuedMutation[]
  rejected: QueuedMutation[]
  dismiss: (mutationId: string) => Promise<void>
  discardAll: () => Promise<void>
}

const NOTHING_QUEUED: QueuedChanges = {
  pending: [],
  rejected: [],
  dismiss: async () => undefined,
  discardAll: async () => undefined,
}

export const QueuedChangesContext = createContext<QueuedChanges>(NOTHING_QUEUED)

export function useQueuedChanges(): QueuedChanges {
  return useContext(QueuedChangesContext)
}

// How a change reads to the paddler in "couldn't be applied" — what they did, not
// the envelope's vocabulary.
const DESCRIPTIONS: Record<string, string> = {
  "trip_member:update": "Float plan details",
  "packing_item:create": "Added to your kit",
  "packing_item:update": "Packed or unpacked an item",
  "packing_item:delete": "Removed from your kit",
  "contribution:create": "Brought an item for the group",
  "contribution:delete": "Withdrew an item from the group list",
  "log:create": "New log",
  "log:update": "Edited a log",
  "log:delete": "Deleted a log",
  "crew_departure:create": "Recorded a paddler leaving",
  "crew_departure:delete": "Undid a paddler leaving",
}

const TRIP_ACTIONS: Record<string, string> = {
  pause: "Paused the trip",
  resume: "Resumed the trip",
  abort: "Aborted the trip",
  finish: "Finished the trip",
}

export function describeChange(change: QueuedMutation): string {
  if (change.entityType === "trip") {
    const action = typeof change.payload.action === "string" ? change.payload.action : null
    return (action && TRIP_ACTIONS[action]) ?? "Changed the trip's end date"
  }
  return DESCRIPTIONS[`${change.entityType}:${change.operation}`] ?? "A change made offline"
}
