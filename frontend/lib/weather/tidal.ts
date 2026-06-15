// Pure tidal-correction helpers for port-referenced (secondary-port) entry.
// Mirrors the Admiralty method: corrected time = standard time ± offset; corrected
// height = standard height × ratio; range = corrected HW height − corrected LW height.

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

export interface PortCorrectionInput {
  baseHighTide?: string | null
  baseLowTide?: string | null
  baseHwHeightM?: number | null
  baseLwHeightM?: number | null
  hwTimeOffsetMinutes?: number | null
  lwTimeOffsetMinutes?: number | null
  hwHeightRatio?: number | null
  lwHeightRatio?: number | null
}

export interface CorrectedTide {
  highTide: string | null
  lowTide: string | null
  tidalRangeM: number | null
}

function isTime(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{1,2}:\d{2}/.test(value)
}

export function deriveCorrectedTide(input: PortCorrectionInput): CorrectedTide {
  const highTide = isTime(input.baseHighTide)
    ? addMinutesToTime(input.baseHighTide, input.hwTimeOffsetMinutes ?? 0)
    : null
  const lowTide = isTime(input.baseLowTide)
    ? addMinutesToTime(input.baseLowTide, input.lwTimeOffsetMinutes ?? 0)
    : null

  let tidalRangeM: number | null = null
  if (input.baseHwHeightM != null && input.baseLwHeightM != null) {
    const correctedHw = input.baseHwHeightM * (input.hwHeightRatio ?? 1)
    const correctedLw = input.baseLwHeightM * (input.lwHeightRatio ?? 1)
    tidalRangeM = Math.round((correctedHw - correctedLw) * 100) / 100
  }

  return { highTide, lowTide, tidalRangeM }
}
