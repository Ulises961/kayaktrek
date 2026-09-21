import { getMyItems } from "../inventory/actions"
import { getPackingItems } from "../inventory/personal-packing-actions"
import { CACHE_KEY, readCachedAt } from "./cache-freshness"
import { saveGearCache } from "./gear-cache"
import { saveKitCache } from "./kit-cache"
import { pullRoute } from "./route-sync"
import { GEAR_STALENESS_BUDGET_MS, planSweep, type SweepTrip } from "./sync-scope"
import { syncTrip } from "./sync"
import { loadTripListCache } from "./trip-list-cache"

// One pass over everything worth having offline, ordered by tier (sync-scope.ts).
//
// This replaces syncing whichever single trip happened to have its Detail hub
// mounted. The route is included deliberately: it travels on its own channel
// (docs/mobile/sync-protocol-spec.md §8.2) and used to be pulled only by the
// Itinerary screen, so a trip whose Itinerary tab was never opened while
// connected had no route offline at all — the worst possible thing to be
// missing at sea, gated on having tapped one particular tab while signal
// lasted.

// Two trips at a time. N sequential syncs on cold cursors is slow, and N at
// once hammers exactly the marginal link this is most likely to run on; the
// sweep is fire-and-forget and must never block a render either way.
const MAX_CONCURRENT_TRIPS = 2

// Foreground, reconnect and pull-to-refresh can all fire within a moment of
// each other. Without this, every trigger starts its own full sweep and the
// request count multiplies by the number of triggers.
let sweepInFlight = false

async function freshnessOf(tripId: string): Promise<string | undefined> {
  const [syncedAt, routeAt] = await Promise.all([
    readCachedAt(CACHE_KEY.tripSync(tripId)),
    readCachedAt(CACHE_KEY.tripRoute(tripId)),
  ])
  // The older of the two channels, and "never" if either has never run. A trip
  // synced a minute ago whose route was never pulled is not fresh in any sense
  // that matters — it is still missing its route.
  if (!syncedAt || !routeAt) return undefined
  return Date.parse(syncedAt) <= Date.parse(routeAt) ? syncedAt : routeAt
}

async function syncOneTrip(tripId: string): Promise<void> {
  // Settled, not all: the channels are independent, and a failure on one must
  // not cost the others. Isolating per trip matters for the same reason — one
  // trip failing is exactly how a trip ends up with nothing cached, which is
  // the failure this exists to close.
  //
  // The kit rides the trip's own tier rather than a schedule of its own, so a
  // trip leaving tomorrow gets its packing list warmed at tier 1 urgency.
  // Packing happens before departure, which is when that trip is most urgent
  // anyway — "did I pack the spare paddle" is asked at the put-in.
  await Promise.allSettled([syncTrip(tripId), pullRoute(tripId), warmKit(tripId)])
}

async function warmKit(tripId: string): Promise<void> {
  await saveKitCache(tripId, await getPackingItems(tripId))
}

// Tier 3's other half, and the reason it is not part of syncOneTrip: the gear
// closet is the paddler's own (`Item`, user-owned), referenced by a trip only
// through a contribution or a packing entry. Fetching it per trip would be the
// same request N times, and gating it on having a syncable trip would leave a
// paddler with no upcoming trip unable to read their own gear offline.
async function warmGearCloset(): Promise<void> {
  const cachedAt = await readCachedAt(CACHE_KEY.gear)
  if (cachedAt && Date.now() - Date.parse(cachedAt) < GEAR_STALENESS_BUDGET_MS) return
  await saveGearCache(await getMyItems())
}

/**
 * Sweep every trip that is due, in priority order.
 *
 * Resolves rather than rejecting, always: this runs unattended on foreground
 * and reconnect with no UI waiting on it, and failing offline is its expected
 * case rather than an exceptional one. A rejection here would surface as an
 * unhandled promise rejection, which React Native renders as a red screen.
 */
export async function runSweep(): Promise<void> {
  if (sweepInFlight) return
  sweepInFlight = true
  try {
    const cached = await loadTripListCache()
    const trips: SweepTrip[] = cached.map((trip) => ({
      id: trip.id,
      state: trip.state,
      dateFrom: trip.dateFrom,
      dateTo: trip.dateTo,
    }))
    const freshness = Object.fromEntries(
      await Promise.all(trips.map(async (trip) => [trip.id, await freshnessOf(trip.id)] as const)),
    )

    const due = planSweep({ trips, freshness })
    for (let index = 0; index < due.length; index += MAX_CONCURRENT_TRIPS) {
      const batch = due.slice(index, index + MAX_CONCURRENT_TRIPS)
      await Promise.all(batch.map((item) => syncOneTrip(item.tripId)))
    }

    // Last, and never allowed to cost the trips anything: a paddler's gear
    // library matters at packing time, the trips matter at sea. Its own
    // rejection is swallowed here rather than by the outer catch, which would
    // otherwise be reached only after the trips had already run — true today,
    // but only by accident of ordering.
    await warmGearCloset().catch(() => undefined)
  } catch {
    // Reading the local cache can fail too (a migration mid-flight, a device
    // stamped at a schema version whose table doesn't exist yet). Same rule:
    // nothing is waiting on this.
  } finally {
    sweepInFlight = false
  }
}
