import { TRIP_STATE, type TripState } from "@shared/dtos/trip"

import { MUTATION_ENTITY, type QueuedMutation } from "../db/mutation-queue"

// M9d WP5: the leader's trip changes made on this phone — pause, resume, abort,
// finish, a new end date — wait in the queue until there is signal. The phone
// shows them as done straight away, laid over the last state it knew; the server
// has the final say when they arrive, and a refusal shows in the queue notice.

export const TRIP_ACTION = {
  PAUSE: "pause",
  RESUME: "resume",
  ABORT: "abort",
  FINISH: "finish",
} as const

export type TripAction = (typeof TRIP_ACTION)[keyof typeof TRIP_ACTION]

export type TripStatus = {
  state: TripState | null
  isPaused: boolean
  dateTo: string | null
}

export function pendingTripChanges(tripId: string, pending: QueuedMutation[]): QueuedMutation[] {
  return pending.filter((change) => change.entityType === MUTATION_ENTITY.TRIP && change.entityId === tripId)
}

export function applyPendingTripChanges(tripId: string, base: TripStatus, pending: QueuedMutation[]): TripStatus {
  return pendingTripChanges(tripId, pending).reduce<TripStatus>((status, change) => {
    const { action, dateTo } = change.payload
    if (typeof dateTo === "string") return { ...status, dateTo }
    switch (action) {
      case TRIP_ACTION.PAUSE:
        return { ...status, isPaused: true }
      case TRIP_ACTION.RESUME:
        return { ...status, isPaused: false }
      case TRIP_ACTION.ABORT:
      case TRIP_ACTION.FINISH:
        return { ...status, state: TRIP_STATE.PAST, isPaused: false }
      default:
        return status
    }
  }, base)
}

/** The calendar day after an ISO date, for "extend the trip by a day". */
export function nextDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
