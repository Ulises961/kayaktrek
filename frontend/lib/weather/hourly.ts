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

// The day strip shows a single representative value per condition — prefer the
// midday (12:00) reading, falling back to the middle of the available hours.
export function representativeHour<T extends { time?: string }>(
  states: T[] | null | undefined,
): T | undefined {
  if (!states || states.length === 0) return undefined
  return states.find((s) => s.time?.startsWith("12")) ?? states[Math.floor(states.length / 2)]
}
