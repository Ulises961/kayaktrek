import { Database, Q } from "nitromelondb"

import { apiGet } from "../api/client"
import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { RouteMeta } from "./models"

type ApiRouteDay = {
  id: string
  dayNumber: number
  date: string | null
  startPointId: string | null
  endPointId: string | null
}

type ApiRoutePoint = {
  id: string
  dayId: string | null
  orderKey: string | null
  latitude: number | null
  longitude: number | null
  name: string | null
  notes: string | null
  type: string | null
}

type ApiRoutePullResponse = {
  routeVersion: number
  days: ApiRouteDay[]
  points: ApiRoutePoint[]
}

// The route (days/points) is one atomic subtree, not a delta (spec §4/§7.1) —
// every pull replaces this trip's ENTIRE local route wholesale, never diffed
// against what's already cached. This is deliberately outside sync.ts's
// generic synchronize() engine, which only understands created/updated/deleted
// per row (§8.2's failure-containment argument: a parked route conflict must
// never wedge crew/float-plan sync behind it).
//
// Except over the leader's own unsent edits (M9d, lib/db/route-edit.ts): a route
// with changes to push, or a parked conflict, is left alone until it is pushed or
// the leader resolves the conflict. `discardLocalChanges` is that resolution
// choosing the server's route.
export async function pullRoute(
  tripId: string,
  database: Database = productionDatabase,
  { discardLocalChanges = false }: { discardLocalChanges?: boolean } = {},
): Promise<void> {
  const daysCollection = database.collections.get("days")
  const pointsCollection = database.collections.get("points")
  const routeMetaCollection = database.collections.get<RouteMeta>("route_meta")

  if (!discardLocalChanges) {
    const [meta] = await routeMetaCollection.query(Q.where("trip_id", tripId)).fetch()
    if (meta?.hasLocalChanges || meta?.inConflict) return
  }

  const response = await apiGet<ApiRoutePullResponse>(`/api/sync/trip/${tripId}/route/pull`)

  const applied = await database.write(async () => {
    const staleDays = await daysCollection.query(Q.where("trip_id", tripId)).fetch()
    const staleDayIds = staleDays.map((day) => day.id)
    const stalePoints = staleDayIds.length
      ? await pointsCollection.query(Q.where("day_id", Q.oneOf(staleDayIds))).fetch()
      : []
    const staleMeta = await routeMetaCollection.query(Q.where("trip_id", tripId)).fetch()

    // Checked again here, under the write, not only before the fetch: the leader can edit, or a
    // push can land, while the request is in the air, and replacing the route wholesale with what
    // was fetched before that would put the older copy over the newer one and wipe the unsent-edits
    // flag with it. A pull the leader explicitly asked for (their choice of the server's route)
    // skips both checks.
    if (!discardLocalChanges) {
      const [current] = staleMeta
      if (current?.hasLocalChanges || current?.inConflict) return false
      if (current && response.routeVersion < current.routeVersion) return false
    }

    const newDays = response.days.map((day) =>
      daysCollection.prepareCreateFromDirtyRaw({
        id: day.id,
        trip_id: tripId,
        day_number: day.dayNumber,
        date: day.date,
        start_point_id: day.startPointId,
        end_point_id: day.endPointId,
      })
    )
    const newPoints = response.points.map((point) =>
      pointsCollection.prepareCreateFromDirtyRaw({
        id: point.id,
        day_id: point.dayId,
        order_key: point.orderKey,
        latitude: point.latitude,
        longitude: point.longitude,
        name: point.name,
        notes: point.notes,
        type: point.type,
      })
    )
    const newMeta = routeMetaCollection.prepareCreateFromDirtyRaw({
      trip_id: tripId,
      route_version: response.routeVersion,
    })

    // Two sequential batches, not one: a day/point id is often reused between
    // pulls (only its fields changed), and WatermelonDB's batch() does not
    // guarantee destroy-before-create ordering across a single call — deleting
    // the stale rows first, in their own batch, avoids a duplicate-key
    // collision against the about-to-be-recreated id.
    await database.batch(
      ...stalePoints.map((point) => point.prepareDestroyPermanently()),
      ...staleDays.map((day) => day.prepareDestroyPermanently()),
      ...staleMeta.map((meta) => meta.prepareDestroyPermanently())
    )
    await database.batch(...newDays, ...newPoints, newMeta)
    return true
  })

  // A pull that was skipped refreshed nothing, so it must not date the cache.
  if (applied) await markCacheFresh(CACHE_KEY.tripRoute(tripId), database)
}
