// Helpers for the hourly weather/sea state series shared by the day strip chips
// and the conditions panel grids. Backend serialises times as "HH:MM:SS".

export function formatHour(time: string | undefined | null): string {
  if (!time) return "—"
  return time.slice(0, 5)
}

// Hour-of-day (0–23) parsed from an "HH:MM:SS" time string, or null if absent.
// Used to align the forecast carousels with the map's hour slider.
export function hourOf(time: string | undefined | null): number | null {
  if (!time) return null
  const h = parseInt(time.slice(0, 2), 10)
  return Number.isNaN(h) ? null : h
}

// Whether a day's sea series carries any wave or swell reading at all. Open-Meteo's marine
// model covers the ocean only, so a lake or an inland waterway comes back as 24 rows of
// nothing — a day with no wave forecast, which is different from an hour with a gap in one.
export function hasWaveForecast(
  states:
    | {
        waveHeight?: number | null
        swellWaveHeight?: number | null
        swellPeriod?: number | null
      }[]
    | null
    | undefined,
): boolean {
  return (
    !!states &&
    states.some((s) => s.waveHeight != null || s.swellWaveHeight != null || s.swellPeriod != null)
  )
}

// The day strip shows a single representative value per condition — prefer the
// midday (12:00) reading, falling back to the middle of the available hours.
export function representativeHour<T extends { time?: string }>(
  states: T[] | null | undefined,
): T | undefined {
  if (!states || states.length === 0) return undefined
  return states.find((s) => s.time?.startsWith("12")) ?? states[Math.floor(states.length / 2)]
}
