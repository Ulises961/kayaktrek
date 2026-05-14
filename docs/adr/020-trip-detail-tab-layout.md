# ADR-020: Trip detail page — tabbed layout and logistics field cleanup

**Status**: accepted
**Date**: 2026-05-11

## Context

As the trip detail page accumulated sections (crew, logistics, travel documents, shuttle,
itinerary, inventory) it became an unbounded vertical scroll. The user experience
degraded: sections far down the page were hard to reach, and there was no clear
information hierarchy beyond "more stuff below."

Additionally, the `Logistics` model contained three fields (`departure_point`,
`arrival_point`, `travel_notes`) that were added during initial design but turned out to
be semantically redundant once the full domain was understood:

- `departure_point` and `arrival_point` duplicate information that already exists (or
  will exist in M4) as the first and last stops of the itinerary. The itinerary is the
  authoritative source of route endpoints.
- `travel_notes` is an unstructured catch-all with no clear owner, no actionability, and
  a high likelihood of being left blank or ignored. Shuttle notes and travel document
  notes cover every concrete use case.

## Decision

**Tab layout:**  
The trip detail page is restructured as a compact header (destination, dates, state badge,
action buttons) + a summary strip (crew avatar cluster, state indicator, difficulty, map
thumbnail), followed by four tabs:

| Tab | Content |
|-----|---------|
| **Overview** | Inline metadata editor (destination, dates, description, difficulty) + crew list + pending invitations |
| **Logistics** | Accordion: Shore Contact · Travel Documents · Shuttle |
| **Itinerary** | Map-first builder (M4) — placeholder until then |
| **Items** | Inventory and gear (M6) — placeholder until then |

The active tab is persisted in the URL as `?tab=<name>` so links are shareable and
browser back/forward works correctly. The Edit button in the header redirects to
`/trips/[id]?tab=overview` rather than a separate `/edit` page. The `/edit` page is
retained as a server-rendered fallback.

**Logistics accordion:**  
Within the Logistics tab, the three sub-sections (Shore Contact, Travel Documents,
Shuttle) are rendered as accordion panels. Each panel can be expanded independently;
a top-level "Expand all" toggle is available so a leader can review the full logistics
picture in one view after finishing data entry.

**Attachment actions on travel documents:**  
Each document row includes inline attachment controls: upload button + drag-and-drop
zone when no attachment exists, download (presigned URL → `window.open`) and remove
button when an attachment is present.

**Field removal:**  
`departure_point`, `arrival_point`, and `travel_notes` are removed from both the
backend `Logistics` model (Alembic migration) and the frontend DTO/form. The backend
cleanup is done during M3f frontend work rather than deferred to M4 to avoid carrying
dead weight through the next milestone.

## Consequences

**Positive**
- The page no longer grows vertically without bound; sections added in M6/M7 get their
  own tab slot without affecting the visible page length.
- Overview tab co-locates metadata editing with the read view — no separate route needed
  for the common case.
- Accordion in Logistics gives crew members a focused workspace for each sub-domain
  without losing the ability to see everything at once.
- Removing redundant logistics fields reduces form surface area and eliminates a category
  of data that would have been entered inconsistently.

**Negative / trade-offs**
- Tab state in the URL requires client-side routing logic (`useSearchParams`) in what was
  previously a server component. The page component stays a server component; tabs live
  in a client wrapper that reads the URL param.
- The Overview tab mixing read + edit requires careful visual separation so it does not
  feel like a settings page.

**Risks / open questions**
- Logs tab: user logs have a dedicated sidebar page. They are not included in the trip
  detail tabs to avoid duplication. This may be revisited once M7 (Logs & Community)
  is designed — a trip-scoped log summary may be worth adding to Overview then.
- The map thumbnail in the summary strip requires a lightweight read-only Leaflet render.
  Until M4 provides itinerary data, this is a placeholder. Ensure the placeholder does
  not break SSR.
