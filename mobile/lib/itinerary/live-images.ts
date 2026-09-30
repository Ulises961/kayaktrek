import type { Day } from "@shared/dtos/day"
import type { Image } from "@shared/dtos/image"

/**
 * Grafts each point's live images onto `days`, keyed by point id.
 *
 * Images aren't part of the offline-editable route at all
 * (lib/itinerary/route-edits.ts's EditablePoint carries no `images` field — the sync
 * protocol never sends them to the phone), so `loadOfflineTrip()`'s locally-reconstructed
 * days never carry any. Once a route has local changes pending, the itinerary screen's own
 * `reload()` switches to that reconstruction for the route geometry — the live trip fetch
 * still succeeded moments earlier, though, so this puts its images back onto whichever
 * geometry is actually being shown.
 *
 * Found on-device: a point with a real photo showed "0" images on mobile while the same
 * point correctly showed "1" on web, because web always reads live and mobile, mid a
 * session of heavy local editing, had switched to the offline reconstruction.
 */
export function withLiveImages(days: Day[], liveDays: Day[]): Day[] {
  const imagesByPointId = new Map<string, Image[]>()
  for (const day of liveDays) {
    for (const point of day.points ?? []) {
      if (point.id && point.images && point.images.length > 0) {
        imagesByPointId.set(point.id, point.images)
      }
    }
  }
  if (imagesByPointId.size === 0) return days

  return days.map((day) => ({
    ...day,
    points: (day.points ?? []).map((point) =>
      point.id && imagesByPointId.has(point.id)
        ? { ...point, images: imagesByPointId.get(point.id) }
        : point,
    ),
  }))
}
