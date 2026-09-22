import { listBlocks } from "../blocks/actions"
import { listConnections } from "../connections/actions"
import { getMyItems } from "../inventory/actions"
import { getPackingItems } from "../inventory/personal-packing-actions"
import { getTrip } from "../trips/actions"
import { CACHE_KEY, readCachedAt } from "./cache-freshness"
import { saveGearCache } from "./gear-cache"
import { saveKitCache } from "./kit-cache"
import { saveBlocksCache, saveConnectionsCache } from "./paddlers-cache"
import { saveRequirementsCache } from "./requirements-cache"
import { pullRoute } from "./route-sync"
import {
  GEAR_STALENESS_BUDGET_MS,
  PADDLERS_STALENESS_BUDGET_MS,
  planSweep,
  type SweepTrip,
} from "./sync-scope"
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

// The sweep must never surface a failure to the paddler — it runs unattended,
// failing offline is its expected case, and a red screen for it would be wrong.
// But "never surfaces" had become "leaves no trace at all": on-device testing
// found one trip missing its crew sync and another missing its route, and
// neither the app nor the logs could say why, because every rejection was
// dropped on the floor. In development the reason is now logged, which Metro
// and `adb logcat` both pick up; in production this stays silent.
function reportSweepFailure(what: string, reason: unknown): void {
  if (!__DEV__) return
  console.warn(`[sweep] ${what} failed:`, reason)
}

function reportSettled(what: string, results: PromiseSettledResult<unknown>[]): void {
  for (const result of results) {
    if (result.status === "rejected") reportSweepFailure(what, result.reason)
  }
}

// `synchronize()` is global to the local database, not scoped to the trip whose
// endpoint it happens to pull, and it refuses to run twice at once — the second
// call aborts before committing ("[Sync] Concurrent synchronization is not
// allowed"). Sweeping two trips in parallel therefore cost one of them its
// entire aggregate channel: no crew, no weather, no sea, and no freshness row
// to show anything was missing.
//
// Found on a device, not in tests, because the tests mocked `syncTrip` as an
// independent promise. Only this one channel is serialised: the route and kit
// have no such constraint, and serialising everything would make a cold
// multi-trip sweep needlessly slow on exactly the marginal link it runs on.
let syncChain: Promise<unknown> = Promise.resolve()

function syncTripSerially(tripId: string): Promise<void> {
  // Chained off the previous call's settlement, not its result, so one trip's
  // failure cannot break the chain for every trip queued behind it.
  const next = syncChain.then(
    () => syncTrip(tripId),
    () => syncTrip(tripId),
  )
  syncChain = next.catch(() => undefined)
  return next
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
  const [sync, route, kit, requirements] = await Promise.allSettled([
    syncTripSerially(tripId),
    pullRoute(tripId),
    warmKit(tripId),
    warmRequirements(tripId),
  ])
  reportSettled(`trip ${tripId} sync`, [sync])
  reportSettled(`trip ${tripId} route`, [route])
  reportSettled(`trip ${tripId} kit`, [kit])
  reportSettled(`trip ${tripId} requirements`, [requirements])
}

async function warmKit(tripId: string): Promise<void> {
  await saveKitCache(tripId, await getPackingItems(tripId))
}

// The Group checklist only arrives inside the full trip detail — there is no
// lighter endpoint — so this is the heaviest request in a trip's sweep. Paid
// anyway: the alternative is the same hole the route had, a trip whose Items
// screen was never opened while connected having no requirements offline.
async function warmRequirements(tripId: string): Promise<void> {
  const trip = await getTrip(tripId)
  await saveRequirementsCache(tripId, trip.inventory?.requirements ?? [])
}

// Tier 3's other half, and the reason it is not part of syncOneTrip: the gear
// closet is the paddler's own (`Item`, user-owned), referenced by a trip only
// through a contribution or a packing entry. Fetching it per trip would be the
// same request N times, and gating it on having a syncable trip would leave a
// paddler with no upcoming trip unable to read their own gear offline.
async function warmGearCloset(): Promise<void> {
  if (await isWithinBudget(CACHE_KEY.gear, GEAR_STALENESS_BUDGET_MS)) return
  await saveGearCache(await getMyItems())
}

// The buddy list and the blocklist: the paddler's own, like the closet, and
// just as lazy until now — the Paddlers screen was the only thing that filled
// them, so a device that never opened it while connected had nothing there
// offline. Two independent fetches; one failing must not cost the other.
async function warmPaddlers(): Promise<void> {
  const [connections, blocks] = await Promise.allSettled([
    (async () => {
      if (await isWithinBudget(CACHE_KEY.connections, PADDLERS_STALENESS_BUDGET_MS)) return
      await saveConnectionsCache(await listConnections())
    })(),
    (async () => {
      if (await isWithinBudget(CACHE_KEY.blocks, PADDLERS_STALENESS_BUDGET_MS)) return
      await saveBlocksCache(await listBlocks())
    })(),
  ])
  reportSettled("buddy list", [connections])
  reportSettled("blocklist", [blocks])
}

async function isWithinBudget(key: string, budgetMs: number): Promise<boolean> {
  const cachedAt = await readCachedAt(key)
  return !!cachedAt && Date.now() - Date.parse(cachedAt) < budgetMs
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
    await warmGearCloset().catch((reason) => reportSweepFailure("gear closet", reason))
    await warmPaddlers()
  } catch (reason) {
    // Reading the local cache can fail too (a migration mid-flight, a device
    // stamped at a schema version whose table doesn't exist yet). Same rule:
    // nothing is waiting on this.
    reportSweepFailure("sweep", reason)
  } finally {
    sweepInFlight = false
  }
}
