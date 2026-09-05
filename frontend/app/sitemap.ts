import type { MetadataRoute } from "next"
import { searchPublicItineraries } from "@/lib/itinerary/actions"
import { INDEXABLE_PATHS, siteUrl } from "@/lib/seo/robots"

// The backend caps per_page at 100 (`Services/itinerary_service.py`).
const PER_PAGE = 100

// Every public route, page by page. `searchPublicItineraries` swallows its own errors and
// returns an empty page, so a backend that is down yields a sitemap of the static paths
// rather than a failed render.
async function publicRouteIds(): Promise<string[]> {
  const first = await searchPublicItineraries({ perPage: PER_PAGE })
  const ids = first.items.map((item) => item.id)

  for (let page = 2; page <= first.pages; page++) {
    const next = await searchPublicItineraries({ perPage: PER_PAGE, page })
    ids.push(...next.items.map((item) => item.id))
  }

  return ids
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ids = await publicRouteIds()

  return [
    ...INDEXABLE_PATHS.map((path) => ({ url: siteUrl(path) })),
    ...ids.map((id) => ({ url: siteUrl(`/routes/${id}`) })),
  ]
}
