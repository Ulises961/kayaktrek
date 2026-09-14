import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import type { Day as DayDTO } from "@shared/dtos/day"
import type { Point as PointDTO } from "@shared/dtos/point"

import { database as productionDatabase } from "./database"
import { Day, Point, Sea, SeaState, Weather, WeatherState } from "./models"
import { loadTripListCache } from "./trip-list-cache"

export type OfflineTrip = { destination: string | null; days: DayDTO[] }

// Reconstructs the same Day[] shape getTrip() returns, from three independent
// local caches: WP4's route (days/points — order_key, not next_id) and WP2's
// per-day weather/sea. There is no single local "trip" aggregate to read this
// from (sync-protocol-spec.md §4 is entirely trip-scoped, never a top-level
// Trip entity) — this is the merge point.
//
// walkPoints() (@shared/itinerary/linked-list) expects a next/nextId chain,
// but the local `points` table only ever stores order_key (spec §7.2 — the
// device never sees next_id). Synthesizing nextId from the order_key sort
// here, once, keeps the map screen's walkPoints() call unchanged for both the
// live and offline-reconstructed paths.
export async function loadOfflineTrip(tripId: string, database: Database = productionDatabase): Promise<OfflineTrip> {
  const daysCollection = database.collections.get<Day>("days")
  const pointsCollection = database.collections.get<Point>("points")
  const weatherCollection = database.collections.get<Weather>("weather")
  const weatherStatesCollection = database.collections.get<WeatherState>("weather_states")
  const seaCollection = database.collections.get<Sea>("sea")
  const seaStatesCollection = database.collections.get<SeaState>("sea_states")

  const localDays = await daysCollection.query(Q.where("trip_id", tripId)).fetch()
  const dayIds = localDays.map((day) => day.id)

  const [localPoints, localWeather, localWeatherStates, localSea, localSeaStates] = dayIds.length
    ? await Promise.all([
        pointsCollection.query(Q.where("day_id", Q.oneOf(dayIds))).fetch(),
        weatherCollection.query(Q.where("day_id", Q.oneOf(dayIds))).fetch(),
        weatherStatesCollection.query(Q.where("day_id", Q.oneOf(dayIds))).fetch(),
        seaCollection.query(Q.where("day_id", Q.oneOf(dayIds))).fetch(),
        seaStatesCollection.query(Q.where("day_id", Q.oneOf(dayIds))).fetch(),
      ])
    : [[], [], [], [], []]

  const pointsByDay = groupBy(localPoints, (point) => point.dayId)
  const weatherByDay = new Map(localWeather.map((weather) => [weather.dayId, weather]))
  const weatherStatesByDay = groupBy(localWeatherStates, (state) => state.dayId)
  const seaByDay = new Map(localSea.map((sea) => [sea.dayId, sea]))
  const seaStatesByDay = groupBy(localSeaStates, (state) => state.dayId)

  const days: DayDTO[] = [...localDays]
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => {
      const orderedPoints = (pointsByDay.get(day.id) ?? [])
        .slice()
        .sort((a, b) => (a.orderKey ?? "").localeCompare(b.orderKey ?? ""))
      const points: PointDTO[] = orderedPoints.map((point, index) => ({
        id: point.id,
        latitude: point.latitude,
        longitude: point.longitude,
        name: point.name,
        notes: point.notes,
        type: point.type === "stop" ? "stop" : "position",
        dayId: point.dayId,
        nextId: orderedPoints[index + 1]?.id ?? null,
      }))

      const weather = weatherByDay.get(day.id)
      const sea = seaByDay.get(day.id)

      return {
        id: day.id,
        dayNumber: day.dayNumber,
        date: day.date,
        startPointId: day.startPointId,
        endPointId: day.endPointId,
        points,
        weather: weather
          ? {
              dayId: weather.dayId,
              model: weather.model,
              fetchedAt: weather.fetchedAt ? new Date(weather.fetchedAt).toISOString() : null,
              weatherStates: (weatherStatesByDay.get(day.id) ?? []).map((state) => ({
                dayId: state.dayId,
                time: state.time,
                temperature: state.temperature,
                precipitation: state.precipitation,
                windDirection: state.windDirection,
                windForce: state.windForce,
                cloud: state.cloud,
              })),
            }
          : null,
        sea: sea
          ? {
              dayId: sea.dayId,
              moonPhase: sea.moonPhase,
              highTide: sea.highTide,
              lowTide: sea.lowTide,
              tidalRangeM: sea.tidalRangeM,
              tidalSource: sea.tidalSource ?? undefined,
              recordedAt: sea.recordedAt ? new Date(sea.recordedAt).toISOString() : null,
              seaStates: (seaStatesByDay.get(day.id) ?? []).map((state) => ({
                dayId: state.dayId,
                time: state.time,
                waveHeight: state.waveHeight ?? 0,
                waveDirection: state.waveDirection ?? 0,
                swellWaveHeight: state.swellWaveHeight,
                swellDirection: state.swellDirection,
                swellPeriod: state.swellPeriod,
                currentSpeed: state.currentSpeed,
                currentDirection: state.currentDirection,
              })),
            }
          : null,
      }
    })

  const cachedTrips = await loadTripListCache(database)
  const destination = cachedTrips.find((trip) => trip.id === tripId)?.destination ?? null

  return { destination, days }
}

function groupBy<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return map
}
