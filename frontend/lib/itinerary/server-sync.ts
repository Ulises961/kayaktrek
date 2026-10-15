import type { Itinerary } from "@/lib/dtos/itinerary"

// What the builder's local state is a copy of. The builder seeds its reducer from the
// server's itinerary once, so after a `router.refresh()` (M36) it has to decide for itself
// whether the new props describe something it does not already show. Comparing the days —
// each carries its points — is enough: it is the only part of the itinerary the reducer
// copies, and the server serialises it in a stable order.
export function itinerarySignature(itinerary: Itinerary): string {
  return JSON.stringify(itinerary.days ?? [])
}
