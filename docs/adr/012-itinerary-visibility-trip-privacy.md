# ADR-012: Itinerary visibility is independent of trip privacy

**Status**: accepted
**Date**: 2025-01-01

## Context

A kayak expedition has two distinct layers of information:

- **Trip**: who is going, when, logistics, crew emergency contacts, medical notes, reservations. This is personal and operational — it belongs to the people on the expedition.
- **Itinerary**: the route itself — the sequence of points, day structure, distances, geography. This is the paddling knowledge — it has community value independent of who did the trip.

The question is where to place a public/private flag, and whether an itinerary can exist independently of a trip.

## Decision

**An itinerary always belongs to a trip.** There is no standalone itinerary. Even a route being planned privately lives inside a draft trip — the trip is the natural container for any planning session, regardless of whether crew have been added or logistics filled in.

**Visibility belongs on the Itinerary, not the Trip.** The trip itself is always private — crew lists, emergency contacts, logistics, and medical notes are never exposed publicly regardless of any flag. The itinerary (route geometry, points, day structure) has its own independent visibility:

| Value | Meaning |
|-------|---------|
| `private` | Visible only to the trip leader and crew. Default for all itineraries. |
| `exclusive` | Visible to trip members only; shareable via a link. Requires Pro subscription (operator tier — scouted routes as commercial IP). If subscription lapses, the route is frozen: still accessible to the owner, but link sharing disabled until subscription resumes. |
| `public` | Listed in the community route library, visible on the landing page map without authentication, and available for cloning. |

A draft trip's itinerary is always `private` — visibility can only be elevated once the trip has been completed or explicitly shared by the leader.

**Route cloning** operates on the itinerary only: copying a public route creates a new trip with a new itinerary pre-populated from the source geometry. The original trip's crew, logistics, and personal data are never accessible or transferred.

## Consequences

**Positive**
- Clear privacy boundary: personal trip data is never exposed regardless of what the leader does with the route
- The community route library (landing page map, M1; route discovery, M7) works without exposing any personal data
- Route cloning is well-defined — copy the itinerary, start a new trip
- The three-state visibility model (`private | exclusive | public`) supports the operator monetisation tier without requiring a separate data model
- Itinerary as the unit of community knowledge matches how paddlers actually think: "I did the Skye circumnavigation" refers to the route, not the specific people or gear on that trip

**Negative / trade-offs**
- The trip→itinerary 1:1 relationship means you cannot reuse an itinerary across multiple trips directly — you clone it, producing a copy. Route segments (reusable day-legs mixed across trips, see ROADMAP) would require a more complex model and are out of scope until M7+.
- `exclusive` visibility and the subscription enforcement logic add backend complexity at the Pro tier.

**Risks / open questions**
- `Itinerary.visibility` field must be added before M4 ships — the public map (M1) depends on being able to query public itineraries, and the itinerary builder (M4) must expose the visibility toggle to the leader.
- Define exactly which itinerary fields are included in the public representation: point coordinates and types `yes`; point images `yes` (they are part of the route story); point notes `TBD` (may contain personal observations the leader did not intend to publish).
- Route segments (ROADMAP): if this feature ships, reconsider whether a `RouteSegment` entity is a better primitive than cloning full itineraries. Do not design for it now — wait until the use case is concrete.
- Teaser mode (ROADMAP operator tier): region, difficulty, and duration visible publicly; waypoints locked behind subscription. This is a display-layer concern, not a data-model concern — the itinerary is `exclusive`, and the public representation omits coordinates but includes metadata.
