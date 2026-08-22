// Shared by Trip and Itinerary, mirroring the backend's Models/difficulty.py. They
// are two different judgements over the same vocabulary: an Itinerary's grade rates
// the route (exposure, crossings, tidal races) and is published; a Trip's is the
// leader's call for one crew on one date and stays private.
export const DIFFICULTIES = ["easy", "moderate", "demanding", "expert"] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const DIFFICULTY = {
  EASY: "easy",
  MODERATE: "moderate",
  DEMANDING: "demanding",
  EXPERT: "expert",
} as const satisfies Record<string, Difficulty>

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  demanding: "Demanding",
  expert: "Expert",
}
