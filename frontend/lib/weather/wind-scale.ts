// The planner's wind colour scale and the legend that explains it, in one place so the
// particles on the map and the bar under them cannot disagree. Web's map hands these to
// leaflet-velocity; mobile (`@shared/weather/wind-scale`) draws its own particles from the
// same stops. Pure TypeScript with no DOM or Next dependency, so both can import it.

// Every stop is high-chroma so it stays legible over light-blue sea tiles.
export const WIND_SPEED_COLORS = [
  "#0d47a1",
  "#0091ea",
  "#00bfa5",
  "#00c853",
  "#aeea00",
  "#ffd600",
  "#ff9100",
  "#ff3d00",
  "#d50000",
] as const

// The top of the window the scale spans, in m/s: this speed and anything above it is the
// last colour. 10 m/s is a fresh-to-strong breeze (Beaufort 5–6), where a kayaker's day
// changes, so the scale spends all its resolution below it.
export const WIND_SPEED_MIN_MS = 0
export const WIND_SPEED_MAX_MS = 10

// What the map gives leaflet-velocity so its particles are coloured over the same window
// the legend describes. The window has to be explicit: left out, the library falls back to
// its own 0–10 m/s default, and a legend would then be agreeing with it by coincidence.
export const WIND_COLOR_OPTIONS = {
  colorScale: [...WIND_SPEED_COLORS],
  minVelocity: WIND_SPEED_MIN_MS,
  maxVelocity: WIND_SPEED_MAX_MS,
}

/**
 * The colour for a wind speed in m/s. Steps to the nearest stop rather than blending,
 * which is how leaflet-velocity indexes a colour scale, so web and mobile agree on every
 * speed.
 */
export function windSpeedColor(speedMetresPerSecond: number): string {
  const last = WIND_SPEED_COLORS.length - 1
  const position =
    (speedMetresPerSecond - WIND_SPEED_MIN_MS) / (WIND_SPEED_MAX_MS - WIND_SPEED_MIN_MS)
  const index = Math.max(0, Math.min(last, Math.round(position * last)))
  return WIND_SPEED_COLORS[index]
}

/** The three ticks under the legend bar: the bottom, the middle and the top of the window. */
export function windLegendLabels(): [string, string, string] {
  return [
    String(WIND_SPEED_MIN_MS),
    String((WIND_SPEED_MIN_MS + WIND_SPEED_MAX_MS) / 2),
    `${WIND_SPEED_MAX_MS}+ m/s`,
  ]
}

/** The legend bar's fill, left (calm) to right (strong). */
export function windLegendGradient(): string {
  return `linear-gradient(to right, ${WIND_SPEED_COLORS.join(", ")})`
}
