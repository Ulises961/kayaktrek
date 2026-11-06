# Kayak Expedition Planner

[![Backend CI](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/frontend-ci.yml)
[![Mobile CI](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/mobile-ci.yml/badge.svg)](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/mobile-ci.yml)
[![codecov](https://codecov.io/gh/Ulises961/kayak-expedition-planner/graph/badge.svg)](https://codecov.io/gh/Ulises961/kayak-expedition-planner)

A platform for planning, running, and sharing multi-day kayak expeditions — built for kayakers by kayakers.

Live at [kayaktrek.app](https://kayaktrek.app).

> **Status: maintenance mode.** Active development has wound down. The hosted instance stays up
> for as long as its domain registration runs; after that, the code here is what remains. No
> support is promised, and issues and pull requests may go unanswered. You are welcome to run
> your own copy: [`DEPLOY.md`](DEPLOY.md) describes the production setup.

## What it does

Planning a kayak expedition involves more than picking a destination. You need to coordinate a crew, build a route around tides and sea conditions, manage gear across multiple people, and stay flexible when the weather changes. This app handles all of it.

**Before the trip** — build the itinerary on a map, day by day, dropping waypoints and stops along a coastline. Invite crew members, assemble a shared gear inventory from everyone's personal kit, and monitor weather and sea forecasts for each leg of the journey.

**During the expedition** — check in daily, update conditions as they evolve, add unplanned stops, and share your live position with crew and with people following from shore. The trip stays editable while it's happening because plans change at sea.

**After the trip** — everything is preserved as a read-only log. Crew members can record paddling hours and sea conditions, endorse each other's experience, and make the route public so that other paddlers can discover it and plan their own adventures.

**Community** — publicly shared itineraries are visible on the map to any visitor. The platform builds a living library of real kayak routes contributed by the community.

## Application structure

```
kayak-expedition-planner/
├── backend/        Flask REST API — auth, trips, itineraries, inventory, logs
├── frontend/       Next.js web app — full-featured client
└── mobile/         React Native (Expo) app — read-only trip/itinerary view today, offline-first sync in progress
```

See each sub-area's README for setup and developer documentation:

- [Backend →](backend/README.md)
- [Frontend →](frontend/README.md)

## Core concepts

**Trip** — the central entity. Has a state (`building → happening → past`, forward-only), a crew of members with roles (leader / crew), an itinerary, and a shared inventory. Private to its members, with an optional public share link.

**Itinerary** — a sequence of days. Can be marked public to share with the community.

**Day** — a paddling day. Contains a route (ordered chain of waypoints), weather forecast, and sea state history for that day.

**Point** — a position on the map, either a `stop` (overnight) or a `position` (waypoint along the route). Points are chained in sequence to form the day's route, and can carry photos (`Image`, opt-in public) and manually-entered tidal diamonds.

**Place** — a point of interest near a route, queryable by proximity. Distinct from `Point`: it sits outside the route's linked list rather than being a stop along it.

**Inventory** — a trip's shared inventory is assembled from items that crew members contribute from their personal kit. Items are checked off as confirmed present before departure.

**Logistics** — pre-expedition coordination for a trip: `Reservation`s (accommodation, transport, permits, other) and `Document`s (permits, licences, required paperwork), plus a shore contact.

**Float plan** — a read-only safety summary (vessel, emergency contact, shore contact, shared itinerary) that can be shared via a public link so people on shore can check on a crew without an account.

**Log** — a personal record of a paddling trip (hours on the water, average sea state, difficulty). Endorsed by peers on shared trips as proof of experience, and rolled up into a public paddler profile alongside certifications.

**Paddler connections** — members can search for and connect with each other, see mutual buddies, and block unwanted contact — independent of any single trip's crew.

**Public route library** — publicly shared itineraries surface in a searchable/discoverable library (`/explore`) that any visitor can browse, and can be forked into a new trip.

## Technology

| Layer | Stack |
|-------|-------|
| Backend | Python, Flask, SQLAlchemy, PostgreSQL, Alembic, Celery |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Leaflet |
| Mobile | React Native (Expo), MapLibre, WatermelonDB (offline sync in progress) |
| Async | Celery + RabbitMQ (task queue, offline sync) |
| Real-time | Redis pub/sub (live position during expedition) |

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE). If you run a modified copy
as a network service, the AGPL requires you to offer your users its source. The name and mark
"Kayaktrek" are not covered by the licence.
