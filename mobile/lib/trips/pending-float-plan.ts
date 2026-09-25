import { MUTATION_ENTITY, MUTATION_OPERATION, type QueuedMutation } from "../db/mutation-queue"

// M9d WP7: a paddler's own float-plan details (vessel, emergency contact) edited on
// this phone, waiting to be sent. Laid over the crew as last synced, so the float
// plan reads the new details at once; `floatPlanUnsent` says they aren't on the
// server yet.
//
// Laid over rather than written into the synced trip_members table: that table is
// pulled, never pushed through WatermelonDB, so a local write would stay marked as
// changed and override later server edits indefinitely.

export const FLOAT_PLAN_FIELDS = [
  "vesselMake",
  "vesselModel",
  "vesselLengthCm",
  "vesselColorPrimary",
  "vesselColorSecondary",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelationship",
] as const

export type FloatPlanField = (typeof FLOAT_PLAN_FIELDS)[number]

export function applyPendingFloatPlan<T extends { id?: string | null }>(
  tripId: string,
  members: T[],
  pending: QueuedMutation[],
): (T & { floatPlanUnsent: boolean })[] {
  const edits = pending.filter(
    (change) =>
      change.entityType === MUTATION_ENTITY.TRIP_MEMBER &&
      change.operation === MUTATION_OPERATION.UPDATE &&
      change.payload.tripId === tripId,
  )
  return members.map((member) =>
    edits
      .filter((change) => change.entityId === member.id)
      .reduce<T & { floatPlanUnsent: boolean }>((current, change) => {
        const fields = Object.fromEntries(
          FLOAT_PLAN_FIELDS.filter((field) => field in change.payload).map((field) => [
            field,
            change.payload[field],
          ]),
        )
        return { ...current, ...fields, floatPlanUnsent: true }
      }, { ...member, floatPlanUnsent: false }),
  )
}
