import { haversineNm } from "@/lib/itinerary/distance"

// §D3: at most one ping per 15 s, and only if displaced ≥ 10 m — dedupes anchor-drift noise from
// a stationary or slow-moving kayak. One rule for web's watch and mobile's background task.
export const PING_THROTTLE_MS = 15_000
export const PING_MIN_DISPLACEMENT_M = 10

const NM_TO_M = 1852

// Where and when the last ping went out. `at` is milliseconds since the epoch.
export type PingAnchor = { lat: number; lon: number; at: number }

export function shouldSendPing(
  anchor: PingAnchor | null,
  fix: { lat: number; lon: number },
  now: number,
): boolean {
  if (anchor === null) return true
  if (now - anchor.at < PING_THROTTLE_MS) return false
  const distanceM =
    haversineNm(
      { latitude: anchor.lat, longitude: anchor.lon },
      { latitude: fix.lat, longitude: fix.lon },
    ) * NM_TO_M
  return distanceM >= PING_MIN_DISPLACEMENT_M
}
