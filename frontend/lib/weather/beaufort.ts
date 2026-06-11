const BEAUFORT_THRESHOLDS = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64] as const

const BEAUFORT_LABELS = [
  "Calm",
  "Light air",
  "Light breeze",
  "Gentle breeze",
  "Moderate breeze",
  "Fresh breeze",
  "Strong breeze",
  "Near gale",
  "Gale",
  "Strong gale",
  "Storm",
  "Violent storm",
  "Hurricane",
] as const

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

export function knotsToBeaufort(knots: number): number {
  for (let b = 0; b < BEAUFORT_THRESHOLDS.length; b++) {
    if (knots < BEAUFORT_THRESHOLDS[b]) return b
  }
  return 12
}

export function beaufortLabel(b: number): string {
  return BEAUFORT_LABELS[Math.min(b, 12)]
}

export function beaufortSeverity(b: number): "calm" | "moderate" | "strong" | "gale" {
  if (b <= 3) return "calm"
  if (b <= 5) return "moderate"
  if (b <= 7) return "strong"
  return "gale"
}

export function waveHeightSeverity(metres: number): "calm" | "moderate" | "rough" | "high" {
  if (metres < 0.5) return "calm"
  if (metres <= 1.5) return "moderate"
  if (metres <= 2.5) return "rough"
  return "high"
}

export function degreesToCompass(deg: number): string {
  return COMPASS[Math.round((deg % 360) / 45) % 8]
}

// Maps significant wave height (metres) to Beaufort equivalent using the
// wave height ranges from the modern Beaufort scale table (Wikipedia).
export function waveHeightToBft(metres: number): number {
  if (metres < 0.1) return 0
  if (metres < 0.3) return 1
  if (metres < 0.6) return 2
  if (metres < 1.0) return 3
  if (metres < 2.0) return 4
  if (metres < 3.0) return 5
  if (metres < 4.0) return 6
  if (metres < 5.5) return 7
  if (metres < 7.5) return 8
  if (metres < 10.0) return 9
  if (metres < 12.5) return 10
  if (metres < 14.0) return 11
  return 12
}

// Combined sea state Bft force.
//
// Wind and waves are both inputs: a distant swell under light wind is as real
// as a local gale on flat water. When wind sea and swell peak simultaneously
// (constructive interference) individual crests reach Hs_wind + Hs_swell —
// the linear sum, always ≥ the spectral Hs the model reports. We use that
// worst-case effective height to stay conservative for paddling safety.
export function combinedSeaState(
  windKnots: number | null | undefined,
  waveMetres: number | null | undefined,
  swellMetres: number | null | undefined,
): number {
  const bftWind = windKnots != null ? knotsToBeaufort(windKnots) : 0

  let effectiveWave = waveMetres ?? 0
  if (waveMetres != null && swellMetres != null && swellMetres <= waveMetres) {
    const windSeaH = Math.sqrt(Math.max(waveMetres ** 2 - swellMetres ** 2, 0))
    effectiveWave = windSeaH + swellMetres
  }

  const bftWave = effectiveWave > 0 ? waveHeightToBft(effectiveWave) : 0
  return Math.max(bftWind, bftWave)
}
