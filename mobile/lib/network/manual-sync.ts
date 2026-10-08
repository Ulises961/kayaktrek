// What the offline banner's "Retry sync" reaches to pull a trip's data. Kept apart from the sweep
// that does the pulling (lib/db/sweep.ts) for the reason push-status.ts is kept apart from the
// pipeline it reports on: the banner is rendered by every screen, so reading this must pull no
// database into a screen — or into a screen's test. The sweep registers itself when it loads.

let handler: (() => Promise<void>) | null = null

export function registerManualSync(next: (() => Promise<void>) | null): void {
  handler = next
}

/** The paddler's own pull. Resolves when it is done, and never rejects: a failure is logged by the sync itself. */
export async function manualSync(): Promise<void> {
  if (!handler) return
  try {
    await handler()
  } catch {
    // Nothing to add: the sync reports its own failures, and a button has no use for one.
  }
}
