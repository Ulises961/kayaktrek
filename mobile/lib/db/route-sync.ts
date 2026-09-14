import { Database, Q } from "nitromelondb"

import { apiGet } from "../api/client"
import { database as productionDatabase } from "./database"

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
export async function pullRoute(tripId: string, database: Database = productionDatabase): Promise<void> {
  const response = await apiGet<ApiRoutePullResponse>(`/api/sync/trip/${tripId}/route/pull`)

  const daysCollection = database.collections.get("days")
  const pointsCollection = database.collections.get("points")
  const routeMetaCollection = database.collections.get("route_meta")

  await database.write(async () => {
    const staleDays = await daysCollection.query(Q.where("trip_id", tripId)).fetch()
    const staleDayIds = staleDays.map((day) => day.id)
    const stalePoints = staleDayIds.length
      ? await pointsCollection.query(Q.where("day_id", Q.oneOf(staleDayIds))).fetch()
      : []
    const staleMeta = await routeMetaCollection.query(Q.where("trip_id", tripId)).fetch()

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
  })
}
