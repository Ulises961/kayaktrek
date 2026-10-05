// Whether this phone's unsent changes are going out, readable by every Screen's
// offline banner. Kept apart from lib/db/push-pending.ts, which does the pushing,
// for the reason queued-changes.ts is kept apart from its provider: the banner is
// rendered by every screen, and reading this must pull no database into a screen
// — or into a screen's test. push-pending writes it and registers the retry.

export type PushResult = "sent" | "failed"
export type PushStatus = { state: "idle" | "pushing" | "failed"; retryAt: number | null }

let status: PushStatus = { state: "idle", retryAt: null }
const listeners = new Set<() => void>()
let retryHandler: (() => Promise<PushResult>) | null = null

export function getPushStatus(): PushStatus {
  return status
}

export function subscribePushStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setPushStatus(next: PushStatus): void {
  if (status.state === next.state && status.retryAt === next.retryAt) return
  status = next
  listeners.forEach((listener) => listener())
}

export function registerPushRetry(handler: () => Promise<PushResult>): void {
  retryHandler = handler
}

/** The paddler's own retry. With nothing registered there is nothing to send. */
export function retryPush(): Promise<PushResult> {
  return retryHandler ? retryHandler() : Promise.resolve("sent")
}
