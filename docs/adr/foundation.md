---
id: foundation
title: "Foundation: Infrastructure, Data Layer, Backend Patterns & Observability"
abstract: Self-hosted stack (PostgreSQL/PostGIS, MinIO, RabbitMQ, Redis, Celery), UUID v7 keys, Alembic migrations, thin resource/service layer, structured JSON logging, and Logfire OTel plan.
status: accepted
date: 2026-06-10
deciders: []
tags: [infrastructure, backend, observability]
---

# Foundation: Infrastructure, Data Layer, Backend Patterns & Observability

This document covers the decisions that underpin every other part of the system — the stack we run on, how data is stored and identified, how the backend is structured, and how we observe it in production. These decisions were made early and have remained stable; they are the load-bearing walls of the architecture.

---

## Owning the whole stack

The architecture is **entirely self-hosted**: PostgreSQL, Redis, RabbitMQ, MinIO, and the application containers all run on a server we control. No component is outsourced to a managed cloud service as a primary dependency. The single exception is Logfire for observability (see below), which is acceptable because observability data is telemetry, not user data, and the exporter can be re-pointed to a self-hosted collector without code changes.

The reasoning is straightforward: no per-service vendor lock-in, predictable cost (one VPS bill, not a sum of per-unit metered services), and full control over data residency — relevant for GDPR and any future maritime data licensing work.

**Escape hatches are built in from day one.** The `StorageService` abstraction means MinIO can be swapped for AWS S3 by changing environment variables. The OTel exporter means observability can be re-pointed to a self-hosted stack. Self-hosted is the default; managed is always an option.

### Update management

Application and infrastructure containers have different risk profiles and different update mechanisms:

- **Application containers** (backend, frontend, Celery worker): updated via the CI/CD pipeline only — `git push → build image → docker compose pull && up`. A human or deliberate pipeline step must be in the loop. No automation deploys application code.
- **Infrastructure containers** (Postgres, Redis, RabbitMQ, MinIO): Watchtower runs in **notify-only mode** — it detects newer images and sends a notification. The operator applies patch/minor updates in a scheduled maintenance window with a tested rollback plan. Major version upgrades are always manual. Watchtower must never be configured to auto-apply infrastructure updates in production.

### Redundancy tiers (in order of value as user base grows)

| Layer | What it does | When to implement |
|-------|-------------|-------------------|
| Process resilience | `restart: unless-stopped` on all containers | Now |
| Offsite backups | Daily `pg_dump` + MinIO bucket sync to Backblaze B2 (not same provider as server) | Before production launch |
| Warm standby | Second server kept current via replicated backups; manual failover | At first paying users |
| Postgres streaming replication | WAL replica on standby; near-zero data loss on primary failure | When downtime has measurable cost |

---

## Data layer

### PostgreSQL with PostGIS

The primary database is **PostgreSQL with the PostGIS extension**. Geospatial columns use `Geography(Point, 4326)` (WGS84 lat/lng) via GeoAlchemy2. Proximity queries use `ST_DWithin` + `ST_Distance`.

PostGIS is the industry standard for open-source geospatial. It handles the POI range queries ("find tidal stations within 5 km") without a separate spatial store. Spatial indexes (`GIST`) must be created explicitly in migrations — easy to forget.

### UUID v7 primary keys

All entities use **UUID v7** as their primary key, generated server-side by the `uuid7` Python library. UUID v7 is time-ordered (millisecond precision in the most-significant bits), giving B-tree index locality close to sequential integers while retaining the non-enumerability of UUIDs. Clients cannot guess adjacent record IDs, and the IDs are safe for future mobile-generated offline mutations (M9).

### Alembic directly — not Flask-Migrate

Migrations are run via `.venv/bin/alembic` directly. Flask-Migrate is installed (it initialises the `Migrate` object that ties Alembic to the app context) but `flask db migrate` and `flask db upgrade` are never used.

The reason: the project uses a custom `alembic/env.py` that imports models explicitly. Flask-Migrate's `flask db migrate` invokes Alembic through its own env, which does not see the custom configuration, producing silent empty migrations. Alembic direct is the only path that reliably detects schema changes.

```bash
# Correct usage
.venv/bin/alembic revision --autogenerate -m "description"
.venv/bin/alembic upgrade head
```

### Object storage — MinIO

Binary objects (user avatars, GDPR export archives) are stored in **MinIO**, a self-hosted S3-compatible object store running as a Docker container. The `StorageService` abstraction uses `boto3`; changing `endpoint_url` is all that is needed to point at AWS S3 in production.

The avatars bucket uses public-read policy (URLs are stable, cacheable, no expiry). GDPR export archives must **not** be in the public-read bucket — they require a private bucket with signed URLs or a protected download endpoint that verifies the requesting user's identity. This is not yet implemented and must be in place before production.

---

## Async stack

Three distinct async/messaging concerns exist in the system, each served by a different component:

**RabbitMQ** — durable message broker for mobile offline sync (M9). A paddler at sea may queue mutations for hours or days. RabbitMQ durability means the queue survives broker restarts; mutations are not lost if the device reconnects briefly and drops again. Also used as the Celery broker.

**Redis** — pub/sub for live position broadcasting (M8). Position data is ephemeral by design — if a message is lost, the next update supersedes it. Very low latency, no disk I/O.

**Celery** — background task queue for weather fetching, email delivery, and GDPR export generation. Brokered by RabbitMQ; uses Redis as the result backend.

Redis DB allocations are fixed to prevent cross-contamination:

| DB | Purpose |
|----|---------|
| 0 | `flask-limiter` rate limit counters |
| 1 | `Flask-Caching` application cache (OpenMeteo responses, POI queries — 6h TTL) |
| 2 | Celery result backend |

Adding a fourth use requires a conscious allocation decision, not a default.

---

## Backend structure — thin resources, service layer

Flask does not prescribe where business logic lives. Without a convention it gravitates toward route handlers — untestable, duplicated, mixed with HTTP concerns.

**Resources** (`Resources/`) are thin HTTP adapters. Their only responsibilities: parse and validate the incoming request, call a service method with plain Python arguments, return a JSON response. No business logic, no direct database queries, no conditional domain logic. If a resource method exceeds ~15 lines it is doing too much.

**Services** (`Services/`) own all business logic. They are plain Python classes with static methods — no Flask imports, no HTTP concerns. They raise domain exceptions (`ValueError`, `PermissionError`, `NoResultFound`) that resources catch and map to HTTP status codes. Integration tests call service methods directly, bypassing HTTP.

**Schemas** (`Schemas/`) handle serialisation/deserialisation via Marshmallow. Ownership stamping (`user_id`, `inventory_id`) happens in `@post_load` — never re-derived in a resource or service method.

**Celery tasks** (`Tasks/`) follow the same principle: they call service methods, never implement logic themselves.

This is an architectural invariant enforced in code review. Flask makes it trivially easy to put a database query directly in a route handler — the path of least resistance is always the wrong one here.

### Static type checking — mypy

The backend is type-checked with **mypy**, adopted incrementally one layer at a time (Models → Schemas → Services → Resources → Tasks → Api), one commit per layer. Variable declarations should carry an explicit annotation at the assignment site (`user: User | None = ...`).

This is for **correctness, readability, and tooling — not runtime performance**. CPython ignores annotations at execution time; speed gains come from PEP 659 (specializing adaptive interpreter) and the PEP 744 JIT. Only ahead-of-time compilers (mypyc, Cython) turn types into speed, and that is a path we are deliberately not taking.

Configuration (`pyproject.toml`) is gradual-adoption: `ignore_missing_imports = true` (GeoAlchemy2, openmeteo-requests, flask-bcrypt and others ship no stubs), strictness tightened per layer as each pass lands. mypy is wired into pre-push (`lefthook`) and CI only against already-clean layers, so the gate never blocks on un-annotated code.

**Flask-SQLAlchemy `db.Model` under mypy:** mypy cannot resolve the dynamically-created `db.Model` as a base class. The fix is a `TYPE_CHECKING`-only shim in `Api/database.py` — `Base` is a real `DeclarativeBase` under type checking and `db.Model` at runtime (`Base is db.Model`). Models inherit `Base`. Switching the *runtime* base to a plain `DeclarativeBase` is wrong: it loses Flask-SQLAlchemy's automatic `__tablename__` generation and breaks every model without an explicit table name.

---

## Observability

### Structured JSON logging (baseline)

All backend log output is **structured JSON on stdout** via a custom `JsonFormatter` in `Services/Utils/logging_utils.py`. Container runtime captures stdout and forwards to any aggregator without per-destination format config.

Log events use machine-readable key names, not sentences:
```python
logger.info("trip_created", extra={"trip_id": ..., "user_id": ...})
```

A `RequestContextFilter` injects `g.request_id` (from `X-Request-ID` header or a fresh UUID) into every log record automatically. SQLAlchemy loggers default to `WARNING`; set `SQL_ECHO=true` to enable query-level `DEBUG` output locally.

This layer is vendor-agnostic: the same stdout stream feeds any aggregator. It stays in place regardless of what is added on top.

### Logfire — distributed tracing (proposed)

The observability gap is the absence of distributed tracing: no span tree, no request timing, no frontend→backend correlation, no automatic Celery task tracing.

The planned addition is **Logfire** (by Pydantic), a managed observability backend built on OpenTelemetry. It provides automatic instrumentation for Flask, SQLAlchemy, Celery, and HTTPX with minimal configuration. No Collector, Tempo, or Loki to operate.

When Logfire is wired:
- The `JsonFormatter` **stays** — it is the vendor-agnostic log layer
- The `JsonFormatter` is extended to emit `trace_id` / `span_id` from the active OTel span so log lines and traces are correlatable in any aggregator
- The manual `g.request_id` becomes redundant for cross-service correlation (OTel handles that); it can remain as a lightweight per-request identifier in logs until OTel is fully verified

If Logfire pricing ever becomes untenable, re-point the OTel exporter to a self-hosted Collector. The stdout JSON logs continue independently without code changes.

---

## E2E test environment must mirror production concurrency

**Context.** The Playwright E2E suite was intermittently flaky on the remote runner — assertions made immediately after a mutation (member removal, state transition, adding a shuttle vehicle) would fail because the UI still showed stale data when the 5s `expect` timeout elapsed. The failures clustered around the trip detail page and worsened the moment M6/M6b landed.

**Root cause — a concurrency mismatch, not a test bug.** The trip detail page (`app/(app)/trips/[id]/page.tsx`) is a Server Component that fans out **seven** backend calls per render via `Promise.allSettled` (trip, logistics, documents, shuttle, profile, items, packing — the last two added by M6/M6b). Every mutation in those flows triggers a full re-render of that component (`router.refresh()` or `revalidatePath`), re-issuing all seven calls. The CI workflow launched the backend with the **single-threaded Werkzeug dev server** (`flask run`), which serves requests strictly serially — so the "parallel" fan-out executed as the *sum* of seven latencies, not the max. M6b's two extra calls pushed that serialized wall-clock past the 5s assertion window. Production runs `gunicorn --workers 2` (`entrypoint.sh`), so this pathology never appeared outside CI.

**Decision.** The E2E backend must run under the **same concurrent server as production** — `gunicorn` with enough workers/threads (`--workers 2 --threads 4`) to serve the trip-detail fan-out without serialization. CI must never run the app under `flask run`. The dev server is for local single-user development only; any environment that exercises concurrent page loads must mirror production's WSGI server. This is paired with modest test-layer hardening (a 10s `expect` timeout, 2 CI retries, a backend warmup request in global setup) to absorb residual jitter, but those are belt-and-suspenders — the concurrency fix is the actual remedy.

**Correction (2026-06-22): gunicorn was necessary but not sufficient.** After this change merged
(PR #22), a remote e2e run on the 2-core runner still showed 4 failed + 2 flaky — the same
post-mutation "UI didn't update within 5s" pattern across edit/cancel/add/transition flows. So
serving the fan-out concurrently helped (≈3× faster, one green run) but did not make the suite
reliably green. The actual remedy is **deterministic post-mutation waits** at the test layer:
`mutateAndSettle(page, trigger)` (`e2e/fixtures/ui.ts`) wraps the click and `Promise.all`s it with
`page.waitForResponse(<POST carrying the `Next-Action` header>)` — arming the wait *before* the
click so the assertion runs against the action's revalidated RSC instead of racing the in-flight
refresh. (A first cut used `waitForLoadState("networkidle")`, but that resolves in the 500ms-quiet
window *before* React's `useTransition` even dispatches the POST, so it still raced; the
response-wait is the fix.) Applied to all 16 mutation→assert spots; `expect.timeout` is 10s with
`retries: 2`. Gunicorn stays (concurrency is still correct and faster); it is just not the whole fix.

**Validation (2026-06-24): reproduced and confirmed under the free-runner envelope.** The free
GitHub runner is effectively 1 vCPU — the real contention driver. Rather than burn remote runs, the
full CI job is reproducible locally via `act` at that envelope (`e2e/run-constrained-ci.sh` →
`--container-options "--cpus=1 --memory=4g"`). Under 1 vCPU the fixed suite is **green: 32 passed,
0 failed, 5 flaky-recovered**. Two genuine bugs surfaced and were fixed (not wait-related): a
`check()` call on a server-controlled, transition-disabled checkbox (→ `click()`), and an unwrapped
save. The residual flakiness (cancel / state transitions / logistics adds occasionally exceeding the
10s window on a single core) is absorbed by `retries: 2` and accepted; the durable fix is the
aggregate `GET /api/trip/:id/detail` endpoint noted below, not more waits.

**Revalidation breadth is deliberate and stays full.** A tempting "fix" was to narrow revalidation — cache the per-tab fetches and only re-fetch the crew list after a member leaves. This is **wrong for correctness**: member-removal cascades across nearly every tab (the member's `RequirementContribution`s vanish so covered requirements flip back to *needed*; requirements they *proposed* cascade away entirely; their private packing list goes; they may have been a shuttle driver/passenger or the shore contact). A narrow revalidation would render state unfaithful to the database. The full re-fetch after high-impact mutations is required; the answer is to make it *fast* (concurrent backend), not *narrow*. A genuine performance improvement — collapsing the seven round-trips into one aggregate `GET /api/trip/:id/detail` endpoint that benefits real users too — is tracked separately as a deliberate design task, not a CI patch.

---

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| JWT in httpOnly cookies | ADR-001 | 2025-01-01 | Access 15 min, refresh 30 days; mobile must use SecureStore (ADR-015) |
| PostgreSQL + PostGIS | ADR-002 | 2025-01-01 | `Geography(Point, 4326)`, GeoAlchemy2 |
| UUID v7 primary keys | ADR-003 | 2025-01-01 | `uuid7` library, server-side generation |
| Alembic direct, not Flask-Migrate | ADR-004 | 2025-01-01 | `flask db` commands never used |
| MinIO for object storage | ADR-005 | 2025-04-01 | S3-compatible; avatars public-read; GDPR exports private bucket (pending) |
| RabbitMQ / Redis / Celery | ADR-007 | 2025-01-01 | Fixed Redis DB allocation |
| Structured JSON logging | ADR-010 | 2025-10-01 | Extended by Logfire (ADR-009) when OTel lands |
| Logfire for observability | ADR-009 | 2026-05-09 | Proposed — replaces manual OTel+Grafana plan |
| Thin resources / service layer | ADR-014 | 2025-01-01 | — |
| Self-hosted architecture | ADR-016 | 2026-05-09 | Logfire is the only managed exception |
| Static type checking with mypy | ADR-029 | 2026-06-19 | Gradual, layer-by-layer; for correctness/tooling not perf; `TYPE_CHECKING` `Base` shim for `db.Model` |
| E2E backend mirrors prod concurrency (gunicorn, not `flask run`) | ADR-030 | 2026-06-22 | Single-threaded dev server serialized the 7-call trip-detail fan-out → flaky post-mutation assertions; M6b's +2 calls tipped it over. Full revalidation breadth stays (member-removal cascades); fix is concurrency, not caching. Aggregate `/api/trip/:id/detail` tracked separately |
