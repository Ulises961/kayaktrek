"use client"
import { useCallback, useEffect, useState, useTransition } from "react"
import {
  fetchDayWeather,
  fetchDaySea,
  fetchTidalGates,
  triggerWeatherFetch,
} from "@/lib/weather/actions"
import type { Sea } from "@/lib/dtos/sea"
import type { Weather } from "@/lib/dtos/weather"
import type { TidalGateWarning } from "@/lib/dtos/tidal-station"

const POLL_INTERVAL_MS = 2000
const POLL_ATTEMPTS = 10

export type DayConditions = {
  weather: Weather | null
  sea: Sea | null
  gates: TidalGateWarning[]
  isRefreshing: boolean
  /** Re-read persisted weather/sea/gates without triggering a new fetch. */
  reload: () => void
  /** Kick off an OpenMeteo fetch (Celery) and poll until data arrives. */
  refresh: () => void
  /** Replace the locally-held sea record (e.g. after a tidal-parameter save). */
  setSea: (sea: Sea) => void
}

/**
 * Loads a day's weather, sea and tidal-gate data, and exposes a `refresh` that
 * triggers an OpenMeteo fetch and polls until the Celery task lands the data.
 * Shared by the conditions section and the feature drawer's Forecast tab.
 */
export function useDayConditions(dayId: string | null, onRefreshed?: () => void): DayConditions {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [sea, setSea] = useState<Sea | null>(null)
  const [gates, setGates] = useState<TidalGateWarning[]>([])
  const [isRefreshing, startRefresh] = useTransition()

  const reload = useCallback(() => {
    if (!dayId) return
    fetchDayWeather(dayId).then((r) => r.success && setWeather(r.data))
    fetchDaySea(dayId).then((r) => r.success && setSea(r.data))
    fetchTidalGates(dayId).then((r) => r.success && setGates(r.data))
  }, [dayId])

  // Clear stale data the instant the day changes (render-time adjust avoids the
  // cascading-render lint that a synchronous setState in an effect would trip).
  const [prevDayId, setPrevDayId] = useState(dayId)
  if (dayId !== prevDayId) {
    setPrevDayId(dayId)
    setWeather(null)
    setSea(null)
    setGates([])
  }

  useEffect(() => {
    reload()
  }, [reload])

  const refresh = useCallback(() => {
    if (!dayId) return
    startRefresh(async () => {
      const result = await triggerWeatherFetch(dayId)
      if (!result.success) return
      // Poll until both weather and sea states arrive from the Celery task.
      for (let i = 0; i < POLL_ATTEMPTS; i++) {
        await new Promise<void>((res) => setTimeout(res, POLL_INTERVAL_MS))
        const [wr, sr] = await Promise.all([fetchDayWeather(dayId), fetchDaySea(dayId)])
        const gotWeather = wr.success && (wr.data.weatherStates?.length ?? 0) > 0
        const gotSea = sr.success && (sr.data.seaStates?.length ?? 0) > 0
        if (gotWeather) setWeather(wr.data)
        if (gotSea) setSea(sr.data)
        if (gotWeather && gotSea) {
          onRefreshed?.()
          return
        }
      }
      reload()
      onRefreshed?.()
    })
  }, [dayId, reload, onRefreshed])

  return { weather, sea, gates, isRefreshing, reload, refresh, setSea }
}
