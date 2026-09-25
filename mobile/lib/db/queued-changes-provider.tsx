import { Q } from "nitromelondb"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { getSession } from "../auth/session"
import { QueuedChangesContext } from "../network/queued-changes"
import { database } from "./database"
import { PendingMutation } from "./models"
import {
  MUTATION_STATUS,
  clearMutationsForUser,
  discardMutation,
  loadQueuedMutations,
  type QueuedMutation,
} from "./mutation-queue"

// Observes the queue table, so the notice updates the moment a screen queues a
// change or a sweep sends one. Mounted once, at the app root.
export function QueuedChangesProvider({ children }: { children: ReactNode }) {
  const [queued, setQueued] = useState<QueuedMutation[]>([])

  useEffect(() => {
    const subscription = database.collections
      .get<PendingMutation>("pending_mutations")
      .query(Q.sortBy("device_timestamp", Q.asc))
      .observe()
      .subscribe(() => {
        // Re-read through loadQueuedMutations rather than using the rows as given:
        // it scopes to the signed-in paddler and parses each payload.
        loadQueuedMutations()
          .then(setQueued)
          .catch(() => setQueued([]))
      })
    return () => subscription.unsubscribe()
  }, [])

  const dismiss = useCallback((mutationId: string) => discardMutation(mutationId), [])
  const discardAll = useCallback(async () => {
    const session = await getSession()
    if (session) await clearMutationsForUser(session.userId)
  }, [])

  const value = useMemo(
    () => ({
      pending: queued.filter((change) => change.status === MUTATION_STATUS.PENDING),
      rejected: queued.filter((change) => change.status === MUTATION_STATUS.REJECTED),
      dismiss,
      discardAll,
    }),
    [queued, dismiss, discardAll],
  )

  return <QueuedChangesContext.Provider value={value}>{children}</QueuedChangesContext.Provider>
}
