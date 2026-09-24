import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import { ApiError, apiPost } from "../api/client"
import { type EditableRoute, orderedPoints } from "../itinerary/route-edits"
import { database as productionDatabase } from "./database"
import { Day, Point, RouteMeta } from "./models"
import { pullRoute } from "./route-sync"

// M9d WP3/WP4: the leader's route edits, local-first. An edit changes the synced
// route tables at once — the map shows it with or without signal — and marks the
// route as having changes to push. The sweep then pushes the whole route over its
// own channel against the version it was based on (spec §8.1–§8.2). A refusal
// because the route changed elsewhere is parked, never merged: the phone keeps its
// own route until the leader compares both and chooses (§8.3–§8.4).

export type RouteSyncState = {
  routeVersion: number
  hasLocalChanges: boolean
  inConflict: boolean
}

export type PushOutcome = "pushed" | "nothing" | "conflict"

async function routeMeta(tripId: string, database: Database): Promise<RouteMeta | null> {
  const [meta] = await database.collections
    .get<RouteMeta>("route_meta")
    .query(Q.where("trip_id", tripId))
    .fetch()
  return meta ?? null
}

export async function loadRouteSyncState(
  tripId: string,
  database: Database = productionDatabase,
): Promise<RouteSyncState | null> {
  const meta = await routeMeta(tripId, database)
  if (!meta) return null
  return {
    routeVersion: meta.routeVersion,
    hasLocalChanges: !!meta.hasLocalChanges,
    inConflict: !!meta.inConflict,
  }
}

export async function loadEditableRoute(
  tripId: string,
  database: Database = productionDatabase,
): Promise<EditableRoute> {
  const days = await database.collections.get<Day>("days").query(Q.where("trip_id", tripId)).fetch()
  const points = days.length
    ? await database.collections
        .get<Point>("points")
        .query(Q.where("day_id", Q.oneOf(days.map((day) => day.id))))
        .fetch()
    : []
  return {
    days: days.map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      date: day.date,
      startPointId: day.startPointId,
      endPointId: day.endPointId,
    })),
    points: orderedPoints(
      points.map((point) => ({
        id: point.id,
        dayId: point.dayId,
        orderKey: point.orderKey,
        latitude: point.latitude,
        longitude: point.longitude,
        name: point.name,
        notes: point.notes,
        type: point.type,
      })),
    ),
  }
}

/** Apply an edit (lib/itinerary/route-edits.ts) to the local route and mark it unsent. */
export async function editRoute(
  tripId: string,
  edit: (route: EditableRoute) => EditableRoute,
  database: Database = productionDatabase,
): Promise<EditableRoute> {
  const meta = await routeMeta(tripId, database)
  if (!meta) throw new Error("This trip's route isn't on this phone yet.")

  const before = await loadEditableRoute(tripId, database)
  const after = edit(before)

  const pointsCollection = database.collections.get<Point>("points")
  const dayRows = await database.collections.get<Day>("days").query(Q.where("trip_id", tripId)).fetch()
  const pointRows = dayRows.length
    ? await pointsCollection.query(Q.where("day_id", Q.oneOf(dayRows.map((day) => day.id)))).fetch()
    : []
  const pointRowsById = new Map(pointRows.map((row) => [row.id, row]))
  const keptIds = new Set(after.points.map((point) => point.id))
  const afterDays = new Map(after.days.map((day) => [day.id, day]))

  await database.write(async () => {
    await database.batch(
      ...pointRows.filter((row) => !keptIds.has(row.id)).map((row) => row.prepareDestroyPermanently()),
      ...after.points.map((point) => {
        const row = pointRowsById.get(point.id)
        if (!row) {
          return pointsCollection.prepareCreateFromDirtyRaw({
            id: point.id,
            day_id: point.dayId,
            order_key: point.orderKey,
            latitude: point.latitude,
            longitude: point.longitude,
            name: point.name,
            notes: point.notes,
            type: point.type,
          })
        }
        return row.prepareUpdate((record) => {
          record.dayId = point.dayId
          record.orderKey = point.orderKey
          record.latitude = point.latitude
          record.longitude = point.longitude
          record.name = point.name
          record.notes = point.notes
          record.type = point.type
        })
      }),
      ...dayRows.map((row) =>
        row.prepareUpdate((record) => {
          const day = afterDays.get(row.id)
          record.startPointId = day?.startPointId ?? null
          record.endPointId = day?.endPointId ?? null
        }),
      ),
      meta.prepareUpdate((record) => {
        record.hasLocalChanges = true
      }),
    )
  })
  return after
}

function routePayload(route: EditableRoute) {
  return {
    days: route.days.map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      date: day.date,
      startPointId: day.startPointId,
      endPointId: day.endPointId,
    })),
    points: orderedPoints(route.points).map((point) => ({
      id: point.id,
      dayId: point.dayId,
      orderKey: point.orderKey,
      latitude: point.latitude,
      longitude: point.longitude,
      name: point.name,
      notes: point.notes,
      type: point.type,
    })),
  }
}

async function markSynced(meta: RouteMeta, routeVersion: number, database: Database): Promise<void> {
  await database.write(async () => {
    await meta.update((record) => {
      record.routeVersion = routeVersion
      record.hasLocalChanges = false
      record.inConflict = false
    })
  })
}

/**
 * Push the trip's edited route, if it has unsent changes. Throws when there is no
 * connection, leaving the changes to push next time.
 */
export async function pushRouteChanges(
  tripId: string,
  database: Database = productionDatabase,
): Promise<PushOutcome> {
  const meta = await routeMeta(tripId, database)
  if (!meta || !meta.hasLocalChanges) return "nothing"
  if (meta.inConflict) return "conflict"

  const route = await loadEditableRoute(tripId, database)
  try {
    const result = await apiPost<{ routeVersion: number }>(`/api/sync/trip/${tripId}/route/push`, {
      baseRouteVersion: meta.routeVersion,
      ...routePayload(route),
    })
    await markSynced(meta, result.routeVersion, database)
    return "pushed"
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      await database.write(async () => {
        await meta.update((record) => {
          record.inConflict = true
        })
      })
      return "conflict"
    }
    throw error
  }
}

/** Every trip with route changes to push — the sweep pushes these before it pulls. */
export async function tripsWithRouteChanges(database: Database = productionDatabase): Promise<string[]> {
  const rows = await database.collections
    .get<RouteMeta>("route_meta")
    .query(Q.where("has_local_changes", true))
    .fetch()
  return rows.filter((row) => !row.inConflict).map((row) => row.tripId)
}

/**
 * The leader's decision on a parked conflict, applied as a command (spec §8.4):
 * "mine" makes the phone's route the route; "theirs" discards the phone's edits
 * and takes the server's.
 */
export async function resolveRouteConflict(
  tripId: string,
  keep: "mine" | "theirs",
  database: Database = productionDatabase,
): Promise<void> {
  const meta = await routeMeta(tripId, database)
  if (!meta) return

  if (keep === "mine") {
    const route = await loadEditableRoute(tripId, database)
    const result = await apiPost<{ routeVersion: number }>(
      `/api/sync/trip/${tripId}/route/resolve`,
      routePayload(route),
    )
    await markSynced(meta, result.routeVersion, database)
    return
  }
  await pullRoute(tripId, database, { discardLocalChanges: true })
}
