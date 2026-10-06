import type { VelocityField } from "./velocity"

// The map overlay's wind and swell fields, rebuilt from what the pull carries instead of fetched
// (docs/mobile/sync-protocol-spec.md §6.5). The server computes every number — the unit
// conversion, the nearest-hour choice, the land mask — and this only stamps them: a day's one
// (u, v) across `size x size` cells, with the land cells nulled for waves. Wind blows over land,
// so it is never masked. That is exactly what the wind-vectors and wave-vectors endpoints return.

/** A day's velocity_days row: the box, the grid size and the mask ("1" = land, row-major from the NW corner). */
export type VelocityDayRow = {
  south: number
  north: number
  west: number
  east: number
  size: number
  landMask: string
}

/** One hour of a day's velocity_hours row; the flow is null when the day has no forecast for the layer. */
export type VelocityHourRow = {
  windU: number | null
  windV: number | null
  waveU: number | null
  waveV: number | null
}

export type VelocityKind = "wind" | "wave"

const LAND = "1"

/**
 * The field for one layer and hour, or null when the day has no flow for it. Throws on a land
 * mask that does not match the grid: drawing it would put the coast in the wrong place.
 */
export function expandVelocityField(
  day: VelocityDayRow,
  hour: VelocityHourRow,
  kind: VelocityKind,
): VelocityField | null {
  const u = kind === "wind" ? hour.windU : hour.waveU
  const v = kind === "wind" ? hour.windV : hour.waveV
  if (u === null || v === null) return null

  const cells = day.size * day.size
  if (day.landMask.length !== cells) {
    throw new Error("The saved wind and swell data for this day is damaged.")
  }

  const masked = kind === "wave"
  const eastward: (number | null)[] = []
  const northward: (number | null)[] = []
  for (let cell = 0; cell < cells; cell++) {
    const isLand = masked && day.landMask[cell] === LAND
    eastward.push(isLand ? null : u)
    northward.push(isLand ? null : v)
  }

  return {
    north: day.north,
    south: day.south,
    west: day.west,
    east: day.east,
    nx: day.size,
    ny: day.size,
    u: eastward,
    v: northward,
  }
}
