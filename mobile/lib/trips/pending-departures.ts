import { MUTATION_ENTITY, MUTATION_OPERATION, type QueuedMutation } from "../db/mutation-queue"

// M9d WP5: a paddler the leader recorded as having left a trip under way, on this
// phone, waiting to be sent. Laid over the crew as last synced so the crew list
// and float plan read true at once; `departureUnsent` says it isn't on the server yet.

type Departure = { id?: string | null; leftAt?: string | null; leftNote?: string | null }

export function applyPendingDepartures<T extends Departure>(
  tripId: string,
  members: T[],
  pending: QueuedMutation[],
): (T & { departureUnsent: boolean })[] {
  const departures = pending.filter(
    (change) => change.entityType === MUTATION_ENTITY.CREW_DEPARTURE && change.payload.tripId === tripId,
  )
  return members.map((member) =>
    departures
      .filter((change) => change.entityId === member.id)
      .reduce<T & { departureUnsent: boolean }>(
        (current, change) =>
          change.operation === MUTATION_OPERATION.DELETE
            ? { ...current, leftAt: null, leftNote: null, departureUnsent: true }
            : {
                ...current,
                leftAt: change.deviceTimestamp,
                leftNote: typeof change.payload.note === "string" ? change.payload.note : null,
                departureUnsent: true,
              },
        { ...member, departureUnsent: false },
      ),
  )
}
