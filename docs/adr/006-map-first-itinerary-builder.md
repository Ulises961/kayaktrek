# ADR-006: Map-first itinerary building (Leaflet, not form-first)

**Status**: accepted
**Date**: 2025-01-01

## Context

The core UX of the application is planning a kayak expedition route. Two interaction models were considered:
- **Form-first**: users enter coordinates or place names into form fields to build a route
- **Map-first**: users interact directly with a map — clicking to drop waypoints, dragging to reorder, seeing the route drawn as they build it

The target users are experienced kayakers who think in terms of geography, tides, and sea state — not spreadsheet-style data entry.

Critically, paddlers make go/no-go decisions by **inspecting satellite imagery**: reading coastline detail, identifying landing beaches, spotting hazards, and assessing exposure. This is a primary planning activity, not an afterthought — the map layer is functional, not decorative.

## Decision

The itinerary builder is **map-first**: the map canvas is the primary interaction surface. Points are created by clicking the map. The route is a linked list of `Point` objects drawn on the map. Day boundaries are set on the map, not in a sidebar form.

**Current implementation (M4)**: Leaflet (`react-leaflet`) with `leaflet-velocity` for wind and ocean current overlays (M5).

**Backend contract**: The backend is intentionally map-SDK-agnostic. It stores raw WGS84 coordinates (`lat`, `lng`) and geometry (`Geography(Point, 4326)`) — no SDK-specific formats, tile references, or vendor identifiers. The API never references Leaflet, Mapbox, or any other SDK. This preserves freedom to change the map SDK on web or use a different one on mobile without any backend changes.

## Consequences

**Positive**
- Matches how kayakers actually plan — coastline inspection is part of route design, not separate from it
- Route drawing, distance calculation, and sea-state overlay are natural on a map
- Satellite imagery layer is first-class, not an option buried in a settings menu
- Competitive differentiation: most paddling apps use list-based route editors
- Backend agnosticism means the mobile client (M9) can use `react-native-maps` or Mapbox Native without API changes

**Negative / trade-offs**
- Significantly more complex frontend than a form — canvas events, marker management, linked-list mutation via drag-and-drop
- Leaflet components must be client-side only (`ssr: false`) — complicates Next.js server rendering
- Leaflet's satellite tile support depends on third-party tile providers (Esri, Mapbox, Google — each with their own terms and costs); this must be resolved before M4 ships
- Mobile (M9): Leaflet is a web library — the mobile client will use a different SDK. The interaction model (tap to drop, drag to reorder) must be redesigned for touch with the chosen SDK. Ensure the two SDKs are not assumed to behave identically

**Risks / open questions**
- **Satellite tile provider**: Mapbox requires an account and has usage-based pricing; Esri World Imagery is free for non-commercial use. Decide before M4. This choice also affects mobile (M9).
- **SDK divergence risk**: if web uses Leaflet and mobile uses Mapbox Native, keep all geo logic in the backend or in SDK-agnostic utility functions. Never let SDK-specific concepts (Mapbox `Feature`, Leaflet `LatLng`) leak into shared data models or the API contract.
- **Point reordering**: the linked-list `Point.next_id` structure requires updating multiple FK references atomically when the user reorders waypoints — the API must handle this as a single transaction (not yet designed for M4)
