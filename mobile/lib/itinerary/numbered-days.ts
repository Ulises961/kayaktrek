/**
 * The itinerary days a trip actually has, with the Day 0 staging area removed.
 *
 * Day 0 is not an itinerary day: it is where every newly dropped point lands before a
 * boundary owns it (`ensureDayZero` in frontend/lib/itinerary/actions.ts — `/api/day/create`
 * cannot even make one, since `day_number` is validated 1..365). It exists only when an
 * itinerary has unassigned points, which is why it surfaces suddenly rather than from the
 * start.
 *
 * Web drops it at every boundary it could escape through — `public-routes.ts`,
 * `map-reducer.ts`, `boundaries.ts`, `season.ts` all filter `dayNumber > 0`. Mobile had no
 * equivalent anywhere, so a staging day rendered as a real "Day 0" tab in the day strip and,
 * being first in the array, became the default selection.
 *
 * Sorted as well as filtered: a day strip has to read 1, 2, 3, and the response's array
 * order is not a contract. Copies before sorting so the caller's array is not mutated.
 *
 * Generic over the day shape so it serves both the private `Day` DTO and the published
 * `PublicDay`, which do not share a type.
 */
export function numberedDays<T extends { dayNumber: number }>(days: T[]): T[] {
  return days.filter((day) => day.dayNumber > 0).sort((a, b) => a.dayNumber - b.dayNumber)
}
