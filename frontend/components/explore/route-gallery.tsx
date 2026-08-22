"use client"
import type { RouteData } from "@/lib/itinerary/public-routes"

export type RoutePhoto = {
  url: string
  /** What the photo shows. Falls back to the point's own name and day. */
  label: string
  pointId: string | null
}

/**
 * Every opted-in photo on the route, flattened in day-then-route order.
 *
 * Flat and single-source on purpose (M19 §4): one strip for the itinerary, no
 * grouping headings, because the caption says what a heading would and says it per
 * photo. Where a photo is comes from clicking it — the map pans to its point.
 */
export function routePhotos(route: RouteData): RoutePhoto[] {
  const photos: RoutePhoto[] = []
  for (const day of route.days) {
    for (const point of day.points) {
      for (const image of point.images) {
        photos.push({
          url: image.url,
          // Most authors will not caption. Anonymous is the thing to avoid, so the
          // point's own name carries it, and the day number when it has no name.
          label: image.caption || point.name || `Day ${day.dayNumber}`,
          pointId: point.id,
        })
      }
    }
  }
  return photos
}

export type RouteGalleryProps = {
  photos: RoutePhoto[]
  onSelect?: (pointId: string | null) => void
}

export function RouteGallery({ photos, onSelect }: RouteGalleryProps) {
  if (photos.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
        Photos
      </h2>
      <ul className="grid grid-cols-3 gap-1.5">
        {photos.map((photo, index) => (
          <li key={`${photo.url}-${index}`}>
            <button
              type="button"
              onClick={() => onSelect?.(photo.pointId)}
              // The whole point of a photo here is to be looked at, so the caption
              // is the accessible name rather than decoration beside it.
              aria-label={photo.label}
              title={photo.label}
              className="focus-visible:ring-ring block w-full overflow-hidden rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.label}
                loading="lazy"
                className="aspect-square w-full object-cover transition-opacity hover:opacity-85"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
