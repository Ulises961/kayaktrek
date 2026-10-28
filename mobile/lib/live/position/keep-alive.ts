// The keep-alive watchdog (plans/M9e.md WP1): the missed-checkpoint alert reads silence, and a phone
// that is not moving sends nothing under the 10 m rule, so a periodic wake-up sends one fresh fix
// if nothing has gone out lately. Asking "has anything been sent" rather than "has the phone moved"
// also covers a moving sender whose pings stopped arriving.

// Android's periodic work cannot run more often than every 15 minutes. Tuned from the evidence log.
export const KEEP_ALIVE_WAKE_MINUTES = 60

// A ping this old no longer counts as recent. Half the wake interval, so one late wake still leaves
// the longest silence far inside the alert's CHECKPOINT_ALERT_HOURS.
export const KEEP_ALIVE_STALE_MS = 30 * 60_000

export function keepAliveDue(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= KEEP_ALIVE_STALE_MS
}
