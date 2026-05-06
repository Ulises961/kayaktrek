# Kayak Expedition Planner

[![Backend CI](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/Ulises961/kayak-expedition-planner/actions/workflows/backend-ci.yml)
[![codecov](https://codecov.io/gh/Ulises961/kayak-expedition-planner/graph/badge.svg)](https://codecov.io/gh/Ulises961/kayak-expedition-planner)

A platform for planning, running, and sharing multi-day kayak expeditions — built for kayakers by kayakers.

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
└── mobile/         React Native app — offline-first, for use at sea (planned)
```

See each sub-area's README for setup and developer documentation:

- [Backend →](backend/README.md)
- [Frontend →](frontend/README.md)

## Core concepts

**Trip** — the central entity. Has a state (`draft → planning → happening → past`), a crew of members with roles (leader / crew), an itinerary, and a shared inventory. Private to its members, with an optional public share link.

**Itinerary** — a sequence of days. Can be marked public to share with the community.

**Day** — a paddling day. Contains a route (ordered chain of waypoints), weather forecast, and sea state history for that day.

**Point** — a position on the map. Can be a `stop` (overnight), `position` (waypoint along the route), or `interest` (point of interest near the route, queryable by range). Points are chained in sequence to form the day's route.

**Inventory** — a trip's shared inventory is assembled from items that crew members contribute from their personal kit. Items are checked off as confirmed present before departure.

**Log** — a personal record of a paddling trip (hours on the water, average sea state). Endorsed by peers as proof of experience.

## Technology

| Layer | Stack |
|-------|-------|
| Backend | Python, Flask, SQLAlchemy, PostgreSQL, Alembic, Celery |
| Web | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Leaflet |
| Mobile | React Native, WatermelonDB (planned) |
| Async | Celery + RabbitMQ (task queue, offline sync) |
| Real-time | Redis pub/sub (live position during expedition) |
