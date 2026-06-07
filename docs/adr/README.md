# Architectural Decision Records

Decisions that shape the system are recorded here as immutable ADRs. Each file captures the context, the decision made, and its consequences at the time it was written.

**Status values**: `accepted` — in force; `proposed` — agreed in principle, implementation pending; `deprecated` — superseded, kept for history.

New decisions go in a new numbered file. Existing ADRs are not edited to reflect a change of direction — write a new ADR that supersedes the old one and update the old one's status line to reference it.

---

| # | Title | Status |
|---|-------|--------|
| [000](000-template.md) | Template | — |
| [001](001-jwt-httponly-cookies.md) | JWT stored in httpOnly cookies, not localStorage | accepted |
| [002](002-postgresql-postgis.md) | PostgreSQL with PostGIS for the primary database | accepted |
| [003](003-uuid-v7-primary-keys.md) | UUID v7 as primary keys on all entities | accepted |
| [004](004-alembic-direct-no-flask-migrate.md) | Use Alembic directly, not Flask-Migrate | accepted |
| [005](005-minio-object-storage.md) | MinIO for object storage (avatars, exports) | accepted |
| [006](006-map-first-itinerary-builder.md) | Map-first itinerary building — satellite imagery is a safety concern, backend is SDK-agnostic | accepted |
| [007](007-rabbitmq-redis-async.md) | RabbitMQ for offline sync, Redis for pub/sub and cache, Celery for async tasks | accepted |
| [008](008-nextjs-app-router-server-actions.md) | Next.js App Router with server actions for mutations | accepted |
| [009](009-observability-logfire.md) | Logfire for distributed tracing (replacing manual OTel plan) | proposed |
| [010](010-structured-json-logging.md) | Structured JSON logging to stdout | accepted |
| [011](011-trip-state-machine.md) | Trip state machine — forward-only transitions, leader-only | accepted |
| [012](012-itinerary-visibility-trip-privacy.md) | Itinerary visibility is independent of trip privacy | accepted |
| [013](013-gdpr-erasure-model.md) | GDPR erasure — soft delete with 30-day grace period, targeted hard-delete | accepted |
| [014](014-flask-thin-resources-service-layer.md) | Flask thin resources — business logic lives in the service layer | accepted |
| [015](015-offline-first-mobile.md) | Offline-first mobile — sync protocol, conflict resolution, and map SDK | proposed |
| [016](016-self-hosted-architecture.md) | Self-hosted architecture — own the stack, update management, redundancy | accepted |
| [017](017-external-gps-device-integration.md) | External GPS device integration — Bluetooth and satellite communicator feeds | proposed |
| [018](018-float-plan-model.md) | Float plan — aggregate HTML view, consent-gated medical visibility | accepted |
| [019](019-trip-collaboration-model.md) | Trip collaboration model — leader authority vs crew contribution | accepted |
| [020](020-trip-detail-tab-layout.md) | Trip detail page — tabbed layout and logistics field cleanup | accepted |
| [021](021-expedition-log-auto-generation.md) | Expedition log auto-generation — Celery dual-trigger model | accepted |
| [022](022-float-plan-sharing-and-notifications.md) | Float plan sharing — frozen snapshot, opaque token, email notifications | accepted |
| [023](023-medical-notes-asymmetric-e2e-encryption.md) | Medical notes — asymmetric end-to-end encryption for leader-visible copy | accepted |
| [024](024-itinerary-builder-interaction-model.md) | Map-first itinerary builder — route-first model, hover-slide day bracketing | accepted |
| [025](025-rest-days-and-paused-expedition-state.md) | Rest days and paused expedition state | accepted |
| [026](026-itinerary-builder-unified-sidebar-boundaries-editor.md) | Itinerary builder UX redesign — unified sidebar, drag boundaries editor, first-class itinerary | accepted |
| [027](027-trip-detail-structure-itinerary-modes-tile-caching.md) | Trip detail page structure, itinerary page view/edit modes, and tile caching model | accepted |
| [028](028-weather-sea-tidal-data.md) | Weather, Sea & Tidal Data — OpenMeteo, tidal stream model, rule of 12s | accepted |
