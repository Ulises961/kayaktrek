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
