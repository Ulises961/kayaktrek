"use client"
import { placeIcon, placeColor } from "@/lib/itinerary/place-icons"
import type { PublicPlace } from "@/lib/dtos/itinerary"

export type RoutePlacesProps = {
  places: PublicPlace[]
  onSelect?: (place: PublicPlace) => void
}

/**
 * The author's published places, grouped by category.
 *
 * Grouping is what makes this readable without anyone writing good prose: a reader
 * scanning for "where do I launch" wants the Slipway rows together, and the category
 * already exists on every place. Only the note is free text, and it is optional.
 */
export function RoutePlaces({ places, onSelect }: RoutePlacesProps) {
  if (places.length === 0) return null

  const byCategory = new Map<string, { name: string; icon?: string | null; items: PublicPlace[] }>()
  for (const place of places) {
    const group = byCategory.get(place.category.slug)
    if (group) {
      group.items.push(place)
      continue
    }
    byCategory.set(place.category.slug, {
      name: place.category.name,
      icon: place.category.icon,
      items: [place],
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
        On the way
      </h2>
      {[...byCategory.entries()].map(([slug, group]) => {
        // Same glyph and tint the map marker uses, so a row and its pin read as the
        // same thing — hazards land in red via placeColor's HAZARD_SLUGS set.
        const Icon = placeIcon(group.icon)
        return (
          <div key={slug} className="flex flex-col gap-1">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
              <Icon className="size-3.5" style={{ color: placeColor(slug) }} />
              {group.name}
            </p>
            <ul className="flex flex-col gap-1 pl-5">
              {group.items.map((place) => (
                <li key={place.id ?? place.label}>
                  <button
                    type="button"
                    onClick={() => onSelect?.(place)}
                    className="hover:text-foreground w-full text-left text-sm transition-colors"
                  >
                    <span className="font-medium">{place.label}</span>
                    {place.note && (
                      <span className="text-muted-foreground block text-xs">{place.note}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
