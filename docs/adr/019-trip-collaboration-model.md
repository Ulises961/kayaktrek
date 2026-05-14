# ADR-019: Trip collaboration model — leader authority vs crew contribution

**Status**: accepted (itinerary editability open — see risks)
**Date**: 2026-05-09

## Context

A kayak expedition is a coordinated group effort. Multiple milestones have accumulated
implicit write-access rules that were never stated consistently:

- Inventory items can be contributed by any crew member (M6)
- Logistics reservations and documents are booked/obtained by individual crew members
- The leader transitions trip state, manages crew, and is responsible for the route

The question is: what does the leader exclusively own, and what is open to collaborative
crew contribution?

## Decision

Write access is split by the nature of the resource:

### Leader-exclusive writes

| Resource | Reason |
|----------|--------|
| Trip state transitions | Safety authority — only the leader declares the expedition underway or complete |
| Crew add / remove | The leader is responsible for who is on the water |
| `Logistics` structural fields (departure point, arrival point, shore contact, travel notes) | Departure/arrival and the shore contact define the safety envelope; a crew member should not be able to silently redirect an emergency call |
| Itinerary structure (see below) | Under analysis — likely leader-only |

### Any crew member (including leader)

| Resource | Reason |
|----------|--------|
| `TravelDocument` | The member who made the booking or obtained the permit enters it — they hold the confirmation number or the file |
| `ShuttleVehicle` | Any crew member can create a vehicle and becomes `arranged_by`; they set capacity (seats, kayak spots) and either set themselves as driver or supply external driver name/contact |
| `ShuttlePassenger` | Any crew member can add themselves to a vehicle; the arranging member or leader can remove a passenger |
| `TripMember` float plan fields | Personal safety data; only the member themselves can set it |
| Personal inventory contributions | The member confirms they are bringing an item |
| `shuttle_notes` and `shuttle_meeting_time` on `Logistics` | Operational coordination, not structural |

### Ownership and deletion

A crew member who creates a `Reservation` or `Document` is its owner. They can edit or
delete their own record. The leader can edit or delete any record on the trip. No other
crew member can delete another member's record — they can propose a correction by adding
a note, but destructive actions on another member's record require leader authority.

### Itinerary editability (open question — decide before M4)

Itinerary structure (adding, moving, or removing route points and days) is currently
unresolved. The risk of open crew editing is real: a crew member could unknowingly push
the route into a tidal gate or exposed crossing that the leader intentionally avoided
through local knowledge. Options:

**a) Leader-only (default closed):** only the leader edits the itinerary. Simplest to
implement and safest. Crew members can view the route and comment (M7+) but cannot move
points.

**b) Leader-delegated:** the leader can grant edit rights to specific crew members.
Useful for multi-day expeditions where different members plan different day-legs.
More complex to implement; adds a `trip_member.can_edit_itinerary` flag.

**c) Any member, leader approves:** crew can propose changes; the leader accepts or
rejects. Requires a pending-change queue — significant complexity.

**Recommendation for M4**: implement **option (a) — leader-only** as the baseline.
Add delegation (b) only when there is a concrete crew-reported need. Option (c) is
deferred indefinitely; the coordination overhead is not justified at this stage.

## Consequences

**Positive**
- Crew contributions to logistics (bookings, permits, shuttle) are natural and require
  no leader approval — reduces the leader as a bottleneck for operational data entry
- Leader retains exclusive control of safety-critical structural data
- Consistent with inventory model (member contributions already work this way)

**Negative / trade-offs**
- A crew member can add a `TravelDocument` and then leave the trip — the orphaned record
  remains. The leader must clean it up. Acceptable; the leader has delete authority.
- `shuttle_notes` is writable by any crew member, but `shore_contact_*` is leader-only.
  This is an intentional split within the `Logistics` record — enforce at the field level
  in the service layer, not at the resource level.
- `TravelDocument` file attachments (MinIO objects) must be cleaned up when a record is
  deleted. The service layer is responsible for removing the object before the DB row.
- The shuttle model is vehicle-first: `ShuttleVehicle` (capacity + organiser) with nested
  `ShuttlePassenger` rows. This lets the UI answer capacity questions (seats remaining,
  kayaks covered, unassigned members) without any derived storage.
- `driver_id` is nullable: when a trip member drives, `driver_id` points to them; when
  the shuttle is external (taxi, transfer company, non-member friend), `driver_id` is
  null and `driver_name` / `driver_contact` hold the external party's details.
  `arranged_by_id` is always non-nullable — a trip member is always accountable for the
  vehicle entry.
- An external shuttle and a `TravelDocument(type=transport)` can coexist for the same
  physical vehicle: use `TravelDocument` when the booking confirmation and receipt are
  what matter; use `ShuttleVehicle` when seat/kayak assignments and passenger groupings
  are what matter. The user decides which granularity they need.

**Risks / open questions**
- **Itinerary**: resolve option (a) vs (b) before M4 ships. Record the decision here.
- **TravelDocument ownership transfer**: if the member who entered a document leaves the
  trip, transfer ownership (and attachment responsibility) to the leader automatically.
- **ShuttleVehicle member departure**: if the `arranged_by` member leaves the trip,
  transfer vehicle ownership to the leader. If they were also `driver_id`, set
  `driver_id = null` (the vehicle effectively becomes externally driven until the leader
  reassigns it). Their `ShuttlePassenger` row is removed automatically.
- **Conflict on `Logistics` structural fields**: two leaders cannot exist simultaneously,
  so concurrent edits are unlikely. No conflict resolution needed now.
