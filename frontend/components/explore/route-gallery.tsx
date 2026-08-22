"use client"
import type { RoutePhoto } from "@/lib/itinerary/public-routes"

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
