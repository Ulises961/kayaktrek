import { TRIP_STATE, type TripState } from "@shared/dtos/trip"

// Which trips a sync covers, and when their cached data is due to refresh.
// M9c's original trigger set (foreground + reconnect) answered *when a sync
// fires* and was read as answering these two as well, which it never did —
// scope ended up an artifact of where the trigger got wired, so only the trip
// whose hub was mounted ever synced. Design of record:
// docs/adr/mobile-offline.md, "Sync scope, priority tiers and staleness
// budgets"; this module is that section's selection rule, kept pure so the
// tiering can be tested without a database or a network.

export const SYNC_TIER = {
  /** `happening` trips, and `building` ones departing imminently. */
  EXPEDITION: 1,
  /** Every remaining `building` trip. */
  PLANNED: 2,
} as const

export type SyncTier = (typeof SYNC_TIER)[keyof typeof SYNC_TIER]

// "Departing within ~48h" per the ADR. Deliberately generous rather than exact:
// this decides how hard the device tries to be current before signal goes away,
// and being a few hours early costs one extra sweep on wifi.
const IMMINENT_DEPARTURE_MS = 48 * 60 * 60 * 1000

// Budgets, not a background timer — "periodic" here means *evaluated on the
// foreground/reconnect triggers that already exist* (the ADR declines true
// periodic execution on both platforms: BGAppRefreshTask fires at the OS's
// discretion, WorkManager has a 15-minute floor plus Doze, and the cost is a
// config plugin, a Play background-execution review surface, and visible
// per-app battery attribution).
//
// The numbers themselves are a first cut, chosen against what each tier is for
// rather than measured: an expedition in progress is refreshed whenever the app
// is opened and there is signal at all, while a trip being planned is warmed on
// wifi at home over the days before departure and gains nothing from being
// re-pulled every time its owner opens the app.
export const STALENESS_BUDGET_MS: Record<SyncTier, number> = {
  [SYNC_TIER.EXPEDITION]: 15 * 60 * 1000,
  [SYNC_TIER.PLANNED]: 6 * 60 * 60 * 1000,
}

// Tier 3 — the paddler's own gear closet. Not in the table above because it is
// not trip-scoped and so never enters `planSweep`, which reasons entirely about
// trips; the sweep applies this one directly. Longer than a planned trip's
// budget: a gear library changes when someone buys or retires a piece of kit,
// which is rare, and it is read at packing time rather than on the water.
export const GEAR_STALENESS_BUDGET_MS = 24 * 60 * 60 * 1000

// The buddy list and blocklist, on the same reasoning: the paddler's own, not
// trip-scoped, and changed by a request being accepted rather than by the
// trip clock. A day old is fine for "who can I invite", which is its reader.
export const PADDLERS_STALENESS_BUDGET_MS = 24 * 60 * 60 * 1000

// Tier 4, the paddler's own record and log stats: the ADR's "long" budget. A
// profile changes when its owner edits it, which refreshes the screen live
// anyway, and log stats move once per logged paddle.
export const PROFILE_STALENESS_BUDGET_MS = 24 * 60 * 60 * 1000

export type SweepTrip = {
  id: string
  state: TripState | null
  dateFrom: string | null
  dateTo: string | null
}

export type SweepItem = {
  tripId: string
  tier: SyncTier
}

// Never synced at all, rather than synced last: lowest priority still means
// "runs eventually, and grows on the device forever". Past and archived trips
// are read-later history, and explore routes (not in this list at all) are a
// discovery surface acted on while connected.
function isSyncable(state: TripState | null): boolean {
  return state === TRIP_STATE.HAPPENING || state === TRIP_STATE.BUILDING
}

function msUntilDeparture(dateFrom: string | null, now: Date): number | null {
  if (!dateFrom) return null
  const departure = new Date(`${dateFrom}T00:00:00Z`).getTime()
  return Number.isNaN(departure) ? null : departure - now.getTime()
}

function tierOf(trip: SweepTrip, now: Date): SyncTier | null {
  if (!isSyncable(trip.state)) return null
  // `happening` earns tier 1 on its own: a trip already under way may well have
  // a departure date days behind it, and that must not demote it.
  if (trip.state === TRIP_STATE.HAPPENING) return SYNC_TIER.EXPEDITION

  const untilDeparture = msUntilDeparture(trip.dateFrom, now)
  if (untilDeparture !== null && untilDeparture <= IMMINENT_DEPARTURE_MS) {
    return SYNC_TIER.EXPEDITION
  }
  return SYNC_TIER.PLANNED
}

function isDue(cachedAt: string | undefined, tier: SyncTier, now: Date): boolean {
  // Never synced is always due — this is the case that leaves a trip with no
  // route offline at all, which is the failure WP7 exists to close.
  if (!cachedAt) return true
  const age = now.getTime() - Date.parse(cachedAt)
  return Number.isNaN(age) || age >= STALENESS_BUDGET_MS[tier]
}

/**
 * The trips a sweep should cover, in the order to do them.
 *
 * `freshness` maps a trip id to when its cache was last refreshed (ISO, from
 * `readCachedAt`); a missing entry means never. Budgets decide what *enters*
 * the sweep and priority orders the work *within* it — the two do different
 * jobs, and collapsing them into a strict priority queue would head-of-line
 * block, so one failing tier 1 trip on a marginal link would starve every tier
 * below it.
 */
export function planSweep({
  trips,
  freshness,
  now = new Date(),
}: {
  trips: SweepTrip[]
  freshness: Record<string, string | undefined>
  now?: Date
}): SweepItem[] {
  return trips
    .map((trip) => ({ trip, tier: tierOf(trip, now) }))
    .filter(
      (candidate): candidate is { trip: SweepTrip; tier: SyncTier } =>
        candidate.tier !== null && isDue(freshness[candidate.trip.id], candidate.tier, now),
    )
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      // Soonest departure first within a tier. A trip with no dates can't be
      // placed by departure and sorts last, rather than being guessed into the
      // imminent end of the queue ahead of a real one.
      const aDeparture = msUntilDeparture(a.trip.dateFrom, now) ?? Number.POSITIVE_INFINITY
      const bDeparture = msUntilDeparture(b.trip.dateFrom, now) ?? Number.POSITIVE_INFINITY
      return aDeparture - bDeparture
    })
    .map(({ trip, tier }) => ({ tripId: trip.id, tier }))
}
