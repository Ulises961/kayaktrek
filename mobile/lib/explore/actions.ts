import type { ExploreFilters, ExplorePage, PublicItineraryDetail } from "@shared/dtos/itinerary"
import { ExplorePageSchema, PublicItineraryDetailSchema } from "@shared/dtos/itinerary"
import { exploreQueryString } from "@shared/itinerary/explore-params"

import { apiGet } from "@mobile/lib/api/client"

export async function searchPublicItineraries(
  filters: ExploreFilters = {},
): Promise<ExplorePage> {
  const query = exploreQueryString(filters)
  const raw = await apiGet<unknown>(`/api/itinerary/explore${query ? `?${query}` : ""}`)
  return ExplorePageSchema.parse(raw)
}

export async function fetchPublicItineraryDetail(id: string): Promise<PublicItineraryDetail> {
  const raw = await apiGet<unknown>(`/api/itinerary/${id}/public`)
  return PublicItineraryDetailSchema.parse(raw)
}
