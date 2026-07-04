---
id: readme
title: Architectural Decision Records
abstract: Index of thematic ADR documents for the Kayak Expedition Planner.
status: accepted
date: 2026-06-10
deciders: []
tags: []
---

# Architectural Decision Records

Decisions that shape the system are recorded here as a set of thematic knowledge-base documents. Each document covers a domain area as a coherent narrative — context, decisions made, consequences, and open questions — rather than isolated per-decision files.

Read the relevant document before working in an area. When a significant new decision is made, update the appropriate document and append to its decision log.

## Documents

| File | Domain |
|------|--------|
| [foundation.md](foundation.md) | Infrastructure, data layer (PostgreSQL/PostGIS, UUID v7, Alembic, MinIO), async stack (RabbitMQ/Redis/Celery), Flask backend patterns, observability |
| [trip-lifecycle.md](trip-lifecycle.md) | Trip state machine, pause/resume, collaboration model (leader vs crew), itinerary visibility and privacy, GDPR erasure |
| [safety-privacy.md](safety-privacy.md) | Float plan (computed view, not stored), medical notes (copy-on-join, ECIES encryption), sharing (frozen snapshot, opaque token), email templates |
| [itinerary-frontend.md](itinerary-frontend.md) | Map-first principle, Next.js App Router + server actions, trip detail page structure, itinerary builder evolution (M4 route-first / M4b unified sidebar + drag boundaries), tile caching architecture, shared form primitives + create/edit form-pair convention (ADR-032) |
| [mobile-offline.md](mobile-offline.md) | Offline-first design, WatermelonDB sync protocol, conflict resolution, weather cache, mutation queue idempotency, MapLibre React Native, external GPS (BLE/NMEA + satellite feed) |
| [features.md](features.md) | Weather & sea data (OpenMeteo, tidal model, rule of 12s, velocity overlays, UI language), expedition log auto-generation |

## Supersession history

The original 28 individual ADR files (ADR-001 through ADR-028) were consolidated into this format in June 2026. Each document's **Decision log** table maps its content back to the original ADR numbers and dates for traceability.

Notable decisions recorded for the first time in these documents (not in any original ADR):

- MapLibre React Native replaces Mapbox Native as the mobile map SDK — open-source fork, MIT licensed, works with our own tile server (see `mobile-offline.md`)
- Weather/sea data is included in the mobile offline cache as a read-only sync-down entity; freshness check via `updated_at` timestamp comparison on reconnection (see `mobile-offline.md`)
