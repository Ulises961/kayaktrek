import type { MetadataRoute } from "next"
import { INDEXABLE_PATHS, siteUrl } from "@/lib/seo/robots"

// Route enumeration paused, not just unused — see the comment above INDEXABLE_PATHS in
// lib/seo/robots.ts. `/explore` and `/routes/<id>` are in that file's DISALLOWED_PATHS
// right now, so listing them here would contradict robots.txt. Recoverable from git
// history (searchPublicItineraries-paginated publicRouteIds()) once §5's real routes are
// live and `/explore`/`/routes` come off the disallow list.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return INDEXABLE_PATHS.map((path) => ({ url: siteUrl(path) }))
}
