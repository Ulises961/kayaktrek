import type { PublicItineraryDetail } from "@/lib/dtos/itinerary"

// Mirrors the backend's hemisphere-aware season derivation (Services/Utils/seasons.py)
// for the public detail view, which carries days/points but no precomputed season facet.
const NORTHERN_MONTHS: Record<string, number[]> = {
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
}

const OPPOSITE: Record<string, string> = {
  winter: "summer",
  summer: "winter",
  spring: "autumn",
  autumn: "spring",
}

function seasonOf(month: number, hemisphereLat: number): string {
  const northern = Object.keys(NORTHERN_MONTHS).find((s) => NORTHERN_MONTHS[s].includes(month))!
  return hemisphereLat >= 0 ? northern : OPPOSITE[northern]
}

// The season of a public route: derived from its earliest dated numbered day and the
// hemisphere of its average point latitude. Null when the route has no dated days.
export function seasonOfDetail(detail: PublicItineraryDetail): string | null {
  const numbered = detail.days.filter((d) => d.dayNumber > 0)
  const dated = numbered
    .map((d) => d.date)
    .filter((d): d is string => !!d)
    .sort()
  if (dated.length === 0) return null

  const lats: number[] = []
  for (const day of numbered) {
    for (const point of day.points) {
      if (point.latitude != null) lats.push(point.latitude)
    }
  }
  const avgLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : 0
  const month = new Date(`${dated[0]}T00:00:00Z`).getUTCMonth() + 1
  return seasonOf(month, avgLat)
}
