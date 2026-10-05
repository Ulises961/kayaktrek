import {
  MUTATION_ENTITY,
  MUTATION_OPERATION,
  type MutationInput,
  enqueueMutation,
} from "../db/mutation-queue"
import { requestPush } from "../db/push-pending"
import { uuidv7 } from "../uuid"

// M9d WP6: kit and group-checklist changes made with no signal. Each is queued
// for the batch endpoint and sent straight away when there is signal; the
// Items screen shows it at once from its own state and cache.

async function queue(input: MutationInput): Promise<string> {
  const mutationId = await enqueueMutation(input)
  requestPush()
  return mutationId
}

export async function queuePackingToggle(entryId: string, checked: boolean): Promise<void> {
  await queue({
    entityType: MUTATION_ENTITY.PACKING_ITEM,
    operation: MUTATION_OPERATION.UPDATE,
    entityId: entryId,
    payload: { checked },
  })
}

/** Returns the new entry's id, chosen here so later changes can refer to it. */
export async function queuePackingAdd(tripId: string, itemId: string): Promise<string> {
  const entryId = uuidv7()
  await queue({
    entityType: MUTATION_ENTITY.PACKING_ITEM,
    operation: MUTATION_OPERATION.CREATE,
    entityId: entryId,
    payload: { tripId, itemId },
  })
  return entryId
}

export async function queuePackingRemove(entryId: string): Promise<void> {
  await queue({
    entityType: MUTATION_ENTITY.PACKING_ITEM,
    operation: MUTATION_OPERATION.DELETE,
    entityId: entryId,
  })
}

/** Returns the queued change's id, so it can be undone before it is sent. */
export async function queueContribution(tripId: string, requirementId: string, itemId: string): Promise<string> {
  return queue({
    entityType: MUTATION_ENTITY.CONTRIBUTION,
    operation: MUTATION_OPERATION.CREATE,
    entityId: requirementId,
    payload: { tripId, itemId },
  })
}
