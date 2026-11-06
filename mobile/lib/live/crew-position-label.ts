import type { LivePosition } from "@shared/dtos/live-position"

import { formatAge } from "./position/sharing-status"

// A crew member not heard from for this long is drawn quieter. Web's live layer uses the same ten
// minutes (`STALE_AFTER_MINUTES`, frontend/components/map/live-position-layer.tsx). A phone that is
// standing still sends nothing by design, so "quiet" means "ask", never "in trouble".
export const STALE_AFTER_MS = 10 * 60_000

export type CrewMarkerLabel = { text: string; stale: boolean }

export function crewMarkerLabel(position: LivePosition, now: number): CrewMarkerLabel {
  const firstName = position.name.trim().split(/\s+/)[0] || "Crew"
  const recordedAt = Date.parse(position.recordedAt)
  if (Number.isNaN(recordedAt)) return { text: firstName, stale: true }

  const ageMs = Math.max(0, now - recordedAt)
  return { text: `${firstName} · ${formatAge(ageMs)}`, stale: ageMs > STALE_AFTER_MS }
}
