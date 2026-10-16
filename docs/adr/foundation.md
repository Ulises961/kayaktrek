---
id: foundation
title: "Foundation: Infrastructure, Data Layer, Backend Patterns & Observability"
abstract: Self-hosted stack (PostgreSQL/PostGIS, MinIO, RabbitMQ, Redis, Celery), UUID v7 keys, Alembic migrations, thin resource/service layer, structured JSON logging, and Logfire OTel plan.
implementation: partial
implementation_note: Logfire tracing shipped (M13 Part A); Sentry is still open — see the root CLAUDE.md observability checklist.
status: accepted
date: 2026-06-10
deciders: []
tags: [infrastructure, backend, observability]
---

# Foundation: Infrastructure, Data Layer, Backend Patterns & Observability

This document covers the decisions that underpin every other part of the system — the stack we run on, how data is stored and identified, how the backend is structured, and how we observe it in production. These decisions were made early and have remained stable; they are the load-bearing walls of the architecture.

---

## Owning the whole stack

The architecture is **entirely self-hosted**: PostgreSQL, Redis, RabbitMQ, MinIO, and the application containers all run on a server we control. No component is outsourced to a managed cloud service as a primary dependency. The single exception was Logfire for observability (see below), which is acceptable because observability data is telemetry, not user data, and the exporter can be re-pointed to a self-hosted collector without code changes. **A second exception is accepted as of 2026-08-23: Cloudflare R2 for binary object storage** (see "Object storage" below). Unlike Logfire this *is* user data, so it is a real departure from the principle rather than a technicality — taken because the alternative is serving every avatar and route photo to a mobile client over residential upstream, and because R2 is S3-compatible, so MinIO remains a drop-in fallback and stays in local dev.

The reasoning is straightforward: no per-service vendor lock-in, predictable cost (one VPS bill, not a sum of per-unit metered services), and full control over data residency — relevant for GDPR and any future maritime data licensing work.

**Escape hatches are built in from day one.** The `StorageService` abstraction means MinIO can be swapped for another S3-compatible store largely by changing environment variables — **largely, not entirely**: verified 2026-08-23 against R2 and the claim is slightly optimistic. `boto3` with `endpoint_url` + `signature_version="s3v4"` is exactly right and needs no change, but the public-read policy is *prefix*-scoped (`minio-init` runs `mc anonymous set download` over `avatars/` and `point-images/` only) and R2's public access is *bucket*-scoped, so the single `_BUCKET` must become a per-`FileKind` mapping. Small, but code. The OTel exporter means observability can be re-pointed to a self-hosted stack. Self-hosted is the default; managed is always an option.

### Update management

Application and infrastructure containers have different risk profiles and different update mechanisms:

- **Application containers** (backend, frontend, Celery worker): updated via the CI/CD pipeline only — `git push → build image → docker compose pull && up`. A human or deliberate pipeline step must be in the loop. No automation deploys application code.
- **Infrastructure containers** (Postgres, Redis, RabbitMQ, MinIO): Watchtower runs in **notify-only mode** — it detects newer images and sends a notification. The operator applies patch/minor updates in a scheduled maintenance window with a tested rollback plan. Major version upgrades are always manual. Watchtower must never be configured to auto-apply infrastructure updates in production.

### Redundancy tiers (in order of value as user base grows)

| Layer | What it does | When to implement |
|-------|-------------|-------------------|
| Process resilience | `restart: unless-stopped` on all containers | Now |
| Offsite backups | Daily `pg_dump` + MinIO bucket sync to Backblaze B2 (not same provider as server) | **Before the first external beta tester's account exists** (tightened 2026-08-23 from "before production launch" — a Play closed test puts other people's data on the box months ahead of anything anyone would call a launch). Includes one rehearsed restore. The R2 migration has now landed (see "Object storage"), so the MinIO→B2 half can be dropped and only `pg_dump` need remain — but only once R2 object versioning is confirmed on, which it is not yet |
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

Binary objects (user avatars, point images, trip documents, GDPR export archives) are stored in **MinIO**, a self-hosted S3-compatible object store running as a Docker container. The `StorageService` abstraction uses `boto3` with `signature_version="s3v4"`.

**Direction as of 2026-08-23, done 2026-08-26 — production runs on Cloudflare R2 (staging and production both); MinIO stays for local dev.** Three reasons, in order of weight:

1. **Egress.** The binding constraint is residential upstream, not storage. A mobile client loading route photos and avatars is the most egress-heavy thing this product does, and R2 charges nothing for egress; a Cloudflare custom domain in front of the public bucket adds CDN caching for free. This is the reason — the rest is bonus.
2. **It changes the offsite-backup item, and only partly removes it** (corrected 2026-08-23 — the first version of this entry overstated it). The redundancy-tier table specifies `pg_dump` **plus** a MinIO bucket sync to Backblaze B2. With objects in R2 and **object versioning enabled**, the routine half of that sync is unnecessary: R2's durability covers hardware, and versioning covers our own delete bug, which is the failure the B2 object copy was really guarding. What neither covers is **account-level loss** — Cloudflare suspension, a billing lapse, a credential compromise used to delete, or bucket deletion, which takes the versions with it. So the object copy is *deferred on a stated risk acceptance*, not eliminated: losing avatars and route photos is regrettable, losing the database is fatal, and that asymmetry is what makes it proportionate pre-beta rather than sloppy. Revisit with a periodic `rclone` R2→B2 copy once photo volume makes the objects worth real protection — R2 charges no egress, so that copy is free when wanted.
   **The `pg_dump` must not go to R2.** The redundancy table's "not same provider as server" rule was written when the server was the thing holding the data; once objects live in R2, Cloudflare *is* primary data, and a dump beside them means one account suspension takes out both the objects and the ability to restore. Two copies in one account are not two backups. B2 (free tier covers it) or any non-Cloudflare provider, with a **write-only, delete-incapable credential** scoped to the bucket — a compromised app token erasing the backups is the exact attack this guards.
3. **It retires a public surface on the home box.** The `storage.<domain>` vhost (added 2026-07-31 so public-read objects and presigned downloads could bypass Flask) stops being needed.

**Migration cost — this was not purely an env-var swap:**
- **Two buckets, not one — shipped.** R2 public access is bucket-scoped, so `avatars/` + `point-images/` go to a public bucket and `documents/` + `point-images-private/` + `exports/` to a private one. `_BUCKET` is now a per-`FileKind` mapping alongside the existing `_KIND_PREFIXES`.
- **`move()`'s cross-bucket copy — not yet re-verified live.** `StorageService.move()` is what flips a point image between public and private (`image_service.py`, the M19 `isPublic` toggle). Under the split its two kinds live in different buckets; `copy_object` supports this, but confirm `CopySource` addresses the correct bucket on each side rather than hardcoding one for both — open follow-up.
- **Stored URLs did not need rewriting.** Both the staging and production object stores were still empty when the cutover happened, so there were no existing `User.avatar_url` / `Image.location` / `TravelDocument.url` rows pointing at MinIO to migrate — the data-migration step described below never had to run. Kept for reference in case a future rollback or dual-store period needs it: `upload()` returns an absolute URL (`{PUBLIC_URL}/{BUCKET}/{key}`) and `object_key_from_url()` recovers the key by splitting on the *prefix*, not the host, so a future migration would be recover-key-then-rebuild rather than string surgery.

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
| 3 | Live-position pub/sub (M8, ADR-033) — channel `live:trip:<trip_id>`, ephemeral only |

Adding a fifth use requires a conscious allocation decision, not a default.

### SSE streaming — hybrid Flask-gevent sidecar (M8, ADR-033)

**Context.** M8's live position sharing needs a server→browser push channel. Gunicorn's sync
workers cannot serve it: each sync worker blocks for the full life of a request, so two workers
means two concurrent streams total, and `--timeout 120` kills anything longer. The worker-class
decision was deliberately deferred from M11 to M8 planning (see the 2026-07-04 site evaluation
and `plans/M11.md`); this entry is that decision.

**Transport: SSE, not WebSockets and not polling.** Position broadcast is strictly
one-directional (server→viewer; ingestion is ordinary `POST`s), lossy-by-design, and
low-frequency. `EventSource` gives auto-reconnect for free, rides plain HTTP through every proxy,
and needs no new protocol or framing library. WebSockets would buy bidirectionality nobody needs
at the cost of flask-sock + a heavier ops surface; polling wastes the battery of the one device
we care about (the paddler's phone).

**Serving: a sidecar running the existing Flask app — not gevent-everywhere, not a new async
app.** Options ranked: **hybrid Flask-gevent sidecar > gevent-everywhere > async (ASGI) sidecar**.
The chosen shape is the Celery pattern applied to HTTP: a second gunicorn instance from the
**same image and codebase**, whose only differences are `--worker-class gevent` and being routed
only the stream traffic — path-routed at the proxy (`/api/v1/live/*` stream endpoints → sidecar,
everything else → the sync backend). This gets:

- **No duplicated logic** — `JWTService`, share-token validation, trip-state checks reused
  verbatim; one app factory, one test suite, one deploy artifact.
- **No second paradigm** — still Flask/WSGI; an ASGI sidecar would mean a parallel framework
  for a handful of endpoints.
- **Monkey-patching quarantined** — the main API stays sync and unpatched; gevent's risks apply
  only to the streaming process, whose endpoints are **I/O-thin by rule**: subscribe to Redis,
  write events; no bcrypt, no heavy ORM work. The sidecar boots via a dedicated entry module
  (`wsgi_sse.py`) whose first statements are `gevent.monkey.patch_all()` and psycogreen's
  `patch_psycopg()` (the driver is C-extension `psycopg2`, which would otherwise block the event
  loop) — a structural split, not an env-guard in the shared `wsgi.py`, so patching cannot leak
  into the main service. Container role is selected by `SERVICE_ROLE=sse` in `entrypoint.sh`.
- Gunicorn `--timeout` is safe to keep on the sidecar: async workers heartbeat to the arbiter
  from the event loop independent of in-flight request duration, so long-lived streams survive
  while a genuinely wedged loop is still caught.

**Acknowledged cost** (the price of any sidecar): second-ingress work — dev/prod routing, CSP
`connect-src`, proxy buffering (`X-Accel-Buffering: no`, flush semantics). **Recorded fallback:**
if the second ingress proves annoying in the deploy target, gevent-everywhere (one patched
service) is the sanctioned retreat — same code, remove the routing split.

**Stream auth — short-lived stream ticket, with a header path reserved for native clients.**
`EventSource` cannot send an `Authorization` header, and JWTs live in httpOnly cookies on the
*Next.js* origin — a direct browser→Flask `EventSource` carries neither. Public story streams
need no auth (unlisted token in the path, same no-oracle 404 contract as the float-plan link).
Crew in-app streams (web) use a **stream ticket**: the authed main API mints a ~5-minute JWT
(existing `JWT_SECRET_KEY`, claims `{purpose: "live-stream", tripId, exp}` — the `purpose` claim
rejects replayed access tokens), passed as a query parameter and verified by the sidecar.
Proxying SSE through a Next route handler was rejected: it adds a buffering-prone streaming hop
to hide a token that expires in minutes anyway.

The ticket is a workaround for a *browser* limitation, not the general contract. The crew
stream route also accepts a normal `Authorization: Bearer` header as an alternative credential,
checked first, ticket checked second. Nothing in the web client uses this today, but React
Native (M9) has no `EventSource` constraint — it makes real HTTP requests and already stores its
access token in `expo-secure-store` (`docs/adr/mobile-offline.md`) — so it authenticates the
stream exactly like every other API call once it exists. Reserved at M8 build time rather than
retrofitted at M9 build time.

**Future rider.** Lightweight real-time trip-collaboration notifications ("member added an
item", "date changed" — cache-invalidation + presence broadcast, not Google-Docs-style merge)
ride this same Redis pub/sub → SSE mechanism and sidecar when scheduled; surfaced during M11,
recorded here so the infra decision is made once.

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

### Logfire — distributed tracing (accepted, implemented — M13)

Before this, the observability gap was the absence of distributed tracing: no span tree, no request timing, no frontend→backend correlation, no automatic Celery task tracing.

**Logfire** (by Pydantic) is the managed observability backend, built on OpenTelemetry, closing that gap. It provides automatic instrumentation for Flask, SQLAlchemy, Celery, `requests`, and Next.js's `fetch` with minimal configuration. No Collector, Tempo, or Loki to operate.

- The `JsonFormatter` **stays** — it is the vendor-agnostic log layer — and is extended
  (`RequestContextFilter`, `Services/Utils/logging_utils.py`) to emit `trace_id`/`span_id` from the
  active OTel span, so a stdout log line and a Logfire trace are pivotable. The manual
  `g.request_id` remains as a lightweight per-request identifier until OTel context propagation is
  verified fully redundant with it.
- **Per-process service naming** (`Api/observability.py` `_resolve_service_name`): the four
  backend roles M8 introduced (main app, SSE sidecar, Celery worker, Celery beat) get distinct
  `service.name` values (`kayak-backend[-sse|-worker|-beat]`) — separable in the Logfire UI, while
  a request that triggers a task still correlates into one trace via standard OTel context
  propagation. Derived from `SERVICE_ROLE` (M8, `entrypoint.sh`) plus an argv check for the two
  Celery entry points, which never set it.
- **High-volume route cost guardrail**: the tile proxy, health check, and the two SSE stream
  routes are excluded from Flask's per-request auto-tracing (`excluded_urls` on
  `instrument_flask`) — structurally high-volume (health check polled every 10s by two containers;
  a single map view bursts 30-60 tile requests; an SSE connection lives for hours).
  **`excluded_urls` is necessary but nowhere near sufficient** (corrected 2026-08-24): it silences
  the Flask span and nothing else, while the handler's own I/O is recorded by a *different*
  instrumentor — SQLAlchemy, `requests` — and, having lost the parent it would have nested under,
  arrives as an unparented top-level trace. The exclusion made the symptom more visible while
  removing the cheaper half of the cost. Each excluded route therefore also suppresses its own I/O
  at the call site with `logfire.suppress_instrumentation()`, the gate every OTel instrumentor
  checks before creating a span: `health()`'s `SELECT 1`, `TileService._fetch_upstream`'s
  `requests.get`, and `stream_events`' per-tick `SELECT trip`. **Adding a route to the exclusion
  list without suppressing its I/O excludes nothing.** Suppression is scoped to the I/O rather
  than the whole request, so `health_check_failed` and `tile_upstream_failed` still reach Logfire
  — they are the only part of those requests worth alerting on. SSE is the one case that wants one
  record rather than zero: `LiveStreamService.stream_events` (M8 ADR-033's sidecar) wraps the
  connection in a manual `logfire.span` with `tick_count`/`position_events`, suppressing only the
  per-tick query beneath it. `excluded_urls` is matched with an unanchored `re.search` against the
  full request URL, so the stream patterns carry an explicit `(\?|$)`: unanchored, they also
  swallowed the once-per-connection `POST .../stream-ticket`, while the crew stream's own
  `?ticket=` query string must still match.
- **Frontend** (`frontend/instrumentation.ts`): `@vercel/otel`'s `registerOTel`, gated on
  `LOGFIRE_TOKEN` and `NEXT_RUNTIME=nodejs` (skips `proxy.ts`'s edge runtime), exports to a
  Logfire-pointed `OTLPTraceExporter`. The write token embeds its own region
  (`pylf_v<version>_<region>_...`) — resolved via the `logfire` package's `resolveBaseUrl` rather
  than a hardcoded host, so it always lands on the same `logfire-{eu,us}.pydantic.dev` the
  backend's Python SDK auto-detects for the same token, with no second region setting to drift out
  of sync. `@vercel/otel`'s `fetch` auto-instrumentation propagates the standard W3C `traceparent`
  header, so a request crossing server action → `apiFetch` → Flask → SQLAlchemy shows up as one
  connected trace — verified live end-to-end. Browser-side RUM is explicitly out of scope; no
  current need justifies the added client bundle weight.
- **Budget guardrail**: the account is on Logfire's Personal (free) plan, which hard-stops
  ingestion automatically at 10M records/month with email + in-app alerts as usage approaches the
  cap — a platform default, not something this project configures. Revisit only on a Team+ upgrade
  (paid tiers have no automatic stop; a self-service spend cap must be set explicitly instead).
- Both `LOGFIRE_TOKEN` env vars stay unset in CI (`backend-ci.yml`, `frontend-ci.yml`); since
  `setup_logfire()`/`instrumentation.ts`'s `register()` run unconditionally on every app boot, the
  entire test suite and build already exercise the no-op path on every run — a dedicated no-op
  test would be redundant with that.

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
trip-detail tab → route-segment refactor noted below, not more waits.

**Final decision (2026-06-25): E2E is officially demoted to a LOCAL-ONLY gate.** The post-mutation
fixes are sound — the same `act` repro that was green at 1 vCPU shows the failures are now pure
*runner variance*: the free GitHub runner's wall-time for the identical suite swung from ~5 min to
**13.5 min**, and under that 3× slowdown two flaky-class specs (`02` edit, `03` cancel) simply
exhaust `retries: 2` while everything else flakes. A check whose red/green is governed by the
runner's mood, not the diff, is not a useful required gate. So `e2e-ci.yml` drops its `push` /
`pull_request` triggers (now `workflow_dispatch`-only — it never runs on the PR path) and the suite
becomes an internal pre-commit/pre-merge gate run locally via `e2e/run-constrained-ci.sh` (act runs
this exact workflow). We **keep and extend** the suite; we just stop letting an unreliable remote
runner block merges on it. The durable cure that would let it return as a remote gate is the
trip-detail tab → route-segment refactor (lighter per-tab loads → insensitive to runner speed);
the aggregate-endpoint idea is parked in favour of that. Tracked in `plans/e2e-hardening.md` and
the `trip-detail-tabs-direction` memory.

**Revalidation breadth is deliberate and stays full.** A tempting "fix" was to narrow revalidation — cache the per-tab fetches and only re-fetch the crew list after a member leaves. This is **wrong for correctness**: member-removal cascades across nearly every tab (the member's `RequirementContribution`s vanish so covered requirements flip back to *needed*; requirements they *proposed* cascade away entirely; their private packing list goes; they may have been a shuttle driver/passenger or the shore contact). A narrow revalidation would render state unfaithful to the database. The full re-fetch after high-impact mutations is required; the answer is to make it *fast* (concurrent backend), not *narrow*. A genuine performance improvement — collapsing the seven round-trips into one aggregate `GET /api/trip/:id/detail` endpoint that benefits real users too — is tracked separately as a deliberate design task, not a CI patch.

---

## API versioning — URL-path `/api/v1`

**Context.** All routes shipped unversioned (`/api/<resource>`) through M6b. With M9 mobile
(offline-first, deployed *independently* of the backend) and the PWA-offline tier on the roadmap,
the canonical trigger for versioning is imminent: an old client in the field hitting a newer
backend. There are currently zero external consumers and the only clients (web frontend, future
mobile) live in this monorepo, so introducing a version scheme now is free of any flag-day
migration — the first mobile release is simply born versioned.

**Decision (2026-06-26).** Adopt **URL-path versioning** — every route moves to `/api/v1/<resource>`.
Chosen over header negotiation (`Accept: application/vnd.kayak.v1+json`) because path versioning is
trivial to route and debug, survives in share links and offline cache keys, and needs no content
negotiation. A future breaking surface ships as a parallel `/api/v2` blueprint set run alongside
`v1`, not an in-place rewrite — so `v1`'s literal paths are stable and never edited again.

**Implementation.**
- **Backend.** Each blueprint's `url_prefix` (or `X_ENDPOINT` constant) carries `/api/v1`; the three
  blueprints that hardcoded full route paths (auth, place, tidal-diamond) carry it inline. No new
  indirection forced through the literal-path blueprints — full constant centralisation isn't
  achievable (3 literal-path blueprints + ~155 test path literals) and has low payoff given v2 is a
  parallel set, not a flip.
- **Frontend.** Versioning lives in **one place** — `apiFetch`/`apiGetPublic`/`apiUpload` in
  `lib/api/client.ts` rewrite the leading `/api` of every caller path to `API_PREFIX` (`lib/api/config.ts`,
  `/api/${API_VERSION}`). The ~35 action files and their tests keep passing unversioned `/api/...`
  paths untouched. The 11 raw `fetch` sites that bypass the client (auth server actions, public
  float-plan page, export/download route handlers) build `${API_URL}${API_PREFIX}/...` directly.

**Hard-cut, no alias.** Since the only clients are in-repo and deploy with the backend, `/api` is not
kept as an unversioned alias — frontend and backend tests moved to `/api/v1` in the same change.

---

## Production hardening scoped as a dedicated milestone (M11)

**Context.** The 2026-07-04 site evaluation (`docs/reviews/2026-07-04-site-evaluation.md`)
found the core architecture sound but identified a consistent theme: the weakest surfaces are
the *edges* — the unthrottled/unrotated refresh endpoint, the total absence of HTTP security
headers, CI gates that don't actually gate (non-blocking lint, no production build, no
migration run, no dependency audits), and deployment plumbing that lags the code (per-worker
startup seeding, fail-open `DATABASE_URL`, no health endpoint, per-upload bucket-policy writes,
proxy-blind rate limiting). Individually small; collectively they are the gap between "works in
compose" and "deployable".

**Decision (2026-07-04).** Crystallize the evaluation's remediation into a single milestone,
**M11 — Production hardening** (`plans/M11.md`), to be tackled as soon as needed — at the latest
before any staging/production deployment, and pullable forward section by section (the
CI-honesty section is worth doing immediately). Scope decisions locked:

- **Refresh tokens gain rotation + reuse detection** built on the existing `token_version`
  mechanism (rotate on every use; a reused token revokes the family). No server-side token
  store is introduced — revocation stays version-based, consistent with ADR-001's stateless JWT
  design.
- **Security headers live in Next.js** (`next.config.ts` `headers()`), not Flask — the browser
  only ever talks to Next; Flask responses never reach it directly.
- **CI must be honest**: blocking lint, `next build`, `alembic upgrade head` + autogenerate
  drift check, Dependabot + audit steps. A green check must mean deployable.
- **Startup work moves out of the app factory**: seeding becomes a CLI command run from the
  migrate step; bucket + policy provisioning stays in `minio-init`, leaving the runtime
  credential needing object CRUD only.
- **OpenAPI contract is explicitly deferred** to an M9 (mobile) prerequisite — it earns its
  cost only when a second consumer exists. Shipped in M13 Part B (2026-07-24), ahead of M9a —
  see the decision-log row below.

**Consequences.** M11 joins observability (Logfire/OTel + Sentry), secrets management, backups,
and TOU/legal on the pre-production checklist; after M11 those remaining checklist items are the
only known deploy blockers. The refresh-rotation change is a breaking contract change for the
frontend session layer (`refreshSession` must persist the newly returned refresh token) and
lands as one coordinated PR.

---

## Deployment hosting — home-first pipeline, DigitalOcean as the pre-defined graduation target

**Context.** M9 (mobile) needs a persistent, network-reachable server so a physical device can hit
a real API instead of a dev laptop's localhost — the trigger for evaluating remote hosting for the
first time. An existing homelab box (`autosuspend` idle-detection, Wake-on-LAN, lid-open/close
session handling already set up on it) was the starting point for a hosting evaluation; the
comparative reasoning behind it is kept outside this document. **DigitalOcean** is the pre-selected
graduation target.

**Decision (2026-07-27).**

1. **Build the deployment pipeline now, decoupled from where it deploys to.** Dockerfiles → an
   image registry (GHCR) → compose pull/deploy is worth having built before it's needed; the
   pipeline's value doesn't depend on its target, so building it while stakes are low is a
   rehearsal, not premature work.
2. **Point that pipeline at the home box for the pre-traction phase.** Full stack — Postgres,
   Redis, RabbitMQ, Flask, Celery, Next.js — self-hosted. This deliberately keeps RabbitMQ
   (Celery's broker, per `celery_app.py`) home too, even though it sits behind Celery-dispatched
   safety-relevant work (missed-checkpoint shore-contact alerts) — see Consequences.
3. **Expose it via Cloudflare Tunnel, not port-forwarding.** `cloudflared` makes an outbound-only
   connection to Cloudflare's edge, so no inbound router rule is needed, it works even behind
   CGNAT, the home IP is never publicly resolvable, and Cloudflare terminates TLS automatically.
   This requires the app's domain to have its DNS hosted on Cloudflare (the tunnel's CNAME is
   created via `cloudflared tunnel route dns`) — a **different DNS setup than dynamic DNS**, which
   solves "my IP keeps changing" by continuously updating an A-record, a problem Tunnel sidesteps
   entirely by never accepting inbound connections in the first place. The existing No-IP DDNS +
   port-forward setup for Nextcloud is untouched; the two don't compose under one hostname, so the
   kayak app gets its own domain/subdomain on Cloudflare-managed DNS.
4. **Extend `autosuspend.conf` with a connection-state check.** The existing `[check.LAN]`
   bandwidth-threshold check can miss genuine low-volume activity (SSE heartbeats, sparse API
   polling from mobile testing) — that traffic can average below any threshold set safely above
   the real background noise floor within the 60s window. An `ExternalCommand` check testing for
   established connections on the app's ports (`ss -tn state established '( sport = :5000 or
   sport = :3000 )'`) is a binary, non-averaged signal layered alongside it, so a live dev/test
   session can't be suspended out from under itself.
5. **Bright-line graduation trigger, fixed now rather than re-litigated per incident:** the whole
   stack moves off the home box onto a paid DO droplet the moment (a) someone outside a personal
   trusted circle relies on it, or (b) money changes hands (Patreon/paid features). At that point
   the already-proven pipeline is re-pointed at a fresh DO droplet — a config/DNS change, not a
   rebuild. Region (Frankfurt vs. Amsterdam) is deferred to a latency check at graduation time;
   both are EU/EEA and legally equivalent for GDPR residency.

**Consequences.**
- The stack stays self-hosted through the pre-traction phase, while still testing against a real
  network-reachable server (mobile devices, friends) rather than only localhost.
- **Residual risk accepted explicitly, not accidentally**: a home power or ISP outage can delay or
  silently drop a Celery-dispatched safety alert during this phase. Mitigation is a self-hosted
  uptime monitor (Uptime Kuma) watching the affected path so a failure pages the operator instead
  of failing silently; Celery's broker-connection-retry/publish-retry configuration should be
  confirmed deliberately (not yet verified — open follow-up) so a transient blip degrades to
  "delayed" rather than "dropped."
- The box's sleep/wake machinery gets real exercise under light live traffic before the stakes go
  up, surfacing edge cases (like the chatter-threshold gap above) while they're cheap to fix.
- At graduation, cutover is "re-point pipeline + DNS," not a first-time deploy build — deliberately
  front-loaded so the actual migration, whenever it happens, is boring.
- Once real users' personal data is processed on any third-party processor (i.e., at graduation,
  not before), DPAs must be signed and sub-processors documented in the privacy policy. Medical
  notes stay E2E-encrypted client-side regardless of host (`docs/adr/safety-privacy.md`) — that
  protection comes from the crypto design, not from data locality, so it's unaffected by any of the
  above.

---

## Per-device sessions and instant revocation (M17)

**Context.** `token_version` is one counter per user, so the backend could revoke *all* of a
user's sessions or none of them. Harmless while the web client was the only client — and the
web UI quietly reflected it, wiring "Sign out" and "Sign out everywhere" to the same action —
but a paddler signing out on the phone does not expect the dashboard they left open at home to
die too, so M9's second client turns this into a real, user-visible bug. Reuse detection had the
same shape: a single retried request could log a user out of every device they own.

**Decision (2026-08-02).** Introduce a `Session` row per device — the refresh-token chain is
the session — and scope revocation to it. This **extends ADR-001 and ADR-032 rather than
superseding them**: ADR-001's actual benefit is that *access* tokens verify by signature alone,
with no DB round-trip per request, and that is unchanged. The session row is read on refresh,
about once per access-token lifetime per device, not on every request.

- **Access tokens gain a `sid` claim and stay stateless.** Revocation writes `revoked:<sid>` to
  a Redis denylist (`/4`) with a TTL equal to the access-token lifetime, so keys expire exactly
  when they stop mattering. Every request costs one Redis `GET`, no Postgres.
- **The denylist fails open.** An unreachable Redis lets a revoked access token live out its
  remaining lifetime — precisely the pre-M17 behaviour, so not a regression. Failing closed
  would turn a Redis blip into a forced logout for every user on the platform.
- **Access-token lifetime stays 15 minutes.** Current guidance puts the band at 5–15 minutes and
  major identity providers default looser. Shortening it is the expensive way to buy what the
  denylist gives for free, and would triple refresh round-trips on the mobile client over exactly
  the flaky coastal connectivity M9 targets.
- **No grace window for benign reuse, and no reuse email.** A time-boxed tolerance for replaying
  the previous token is indistinguishable from the attack it is meant to excuse; the race is a
  client problem and is fixed by single-flighting refresh on the client. A "suspicious activity"
  email would fire on backgrounded apps and retried requests, training users to ignore the one
  that matters — the disclosure channel is **pull, not push**: a sessions list the user can
  consult whenever they want.
- **Coarse location, derived at write time, never an IP.** The sessions list shows an
  approximate origin because "Chrome on Windows, 2 minutes ago" cannot answer "was that me?"
  while "active from Brazil" can. Resolved in-process from the Cloudflare Tunnel's location
  headers (ADR-034) — no third-party geo API, no processor relationship — and trusted only when
  `PROXY_TRUSTED_HOPS` says the request really arrived through the proxy, since a spoofable
  header must not become displayed fact. Only the resulting label is stored.

**Consequences.** Every user is logged out once at deploy: existing refresh tokens carry no
`sid`, and a token without one is not honoured. This is deliberate — the alternative is a window
in which revocation cannot be enforced. `User.refresh_token_version` is superseded by the
per-session counter and is kept one release for rollback safety, then dropped. The sessions list
is also the substrate for the session-management UI already cross-referenced in `ROADMAP.md`.

---

## Testing standards — assertion completeness over coverage percentage (M15)

**Context.** M14's build surfaced a specific failure mode: the `applyBoundaries`-fails branch
of `handleSaveDays` leaked orphaned `Day` rows, and a test **already covered that branch** —
it asserted the state rollback and never asserted the cleanup, so a coverage report showed the
line green while the bug sat inside it. A 2026-08-02 measurement of the frontend suite found
this was not an isolated case: of 204 test files / 2008 tests, **143 files (71%) never
exercise a failure path** at all — only "what happens when everything works." Every bug found
by manual walkthrough in M8's phase-9 QA and M12's review (blank error UX, a UTC/local date
drift, mutually-exclusive modes that weren't) lived in exactly the space those tests decline to
enter.

**Decision.** Coverage percentage is explicitly **not** a target — it is the metric that
scored the M14 orphan leak as green, since line coverage cannot distinguish "this line ran"
from "this line's effect was checked." The target is **assertion completeness**, governed by a
frozen rubric (`frontend/CLAUDE.md`'s "Testing standards" section is the canonical copy — this
entry is the decision record, not a duplicate to keep in sync by hand):

1. A lone `toHaveBeenCalledWith` on a mocked module is acceptable only when the call *is* the
   entire contract (a Discard that performs no server call; an action's URL/body mapping).
   Whenever the call has consequences — state, ordering, cleanup, navigation, a toast — assert
   the consequence, not just the call.
2. Every failure-path test asserts what is cleaned up or compensated, not only what is rolled
   back. This is the rule the M14 orphan leak escaped through.
3. Every server action has at least one non-ok-response test and one thrown-error test,
   asserting the returned failure shape — not just that it didn't throw.
4. Every component that can display an error state has a test that puts it in that state and
   asserts what the user sees. A mutation with no failure test is incomplete.
5. Mocks must not encode behaviour the real implementation does not have — spot-check the real
   signature/return shape when mocking a module ([[feedback_mock_fidelity]]).
6. Do not test the framework (pre-existing rule, restated because a coverage-driven sweep is
   tempted to pad counts with framework-mechanics assertions).
7. No test is added purely to raise a number. "This file is genuinely well-covered, no changes
   needed" is a valid, reportable outcome of a review pass — not a gap.

Two failure shapes need different remedies: server-action tests (`lib/<domain>/__tests__/actions.test.ts`)
are missing the error branches entirely (non-ok response, the one-shot 401-refresh-and-retry
guard, thrown network errors); component tests assert "the handler was invoked" where they
should assert the user-visible consequence (what renders, disables, disappears, or is
communicated on failure).

**Consequences.** Every work package's production-code fixes are kept in their own commit,
separate from test-only changes — a sweep that silently alters behaviour while "just adding
tests" is worse than the coverage gap it closes. The rubric is frozen before any sweep work
starts (M15's Wave 0) so every parallel work package reads one source of truth rather than
drifting per-agent interpretations.

---

## Deploy availability — maintenance mode and rolling replacement, not blue/green (M33)

**Context (2026-09-20).** M25 opened registration and real users started joining. `scripts/
deploy.sh` recreates `backend`, `frontend` and `sse` in place, so every deploy is a window in
which a visitor gets a connection error. That was free when the operator was the only user; it
is not free now. The question posed was maintenance mode *or* blue/green.

**Decision: neither as posed — maintenance mode as the foundation, per-service rolling
replacement on top of it, and blue/green rejected.** Scoped as `plans/M33-deploy-availability.md`.

**Why blue/green is rejected — measured, not estimated.** Taken on `kayak-do` on the date of
this decision:

- A parallel serving tier is `backend` 768M + `sse` 512M + `frontend` 512M = **1792M**, against
  **2064M available** with 220M already in swap. It fits only by consuming the ~2147M of page
  cache Postgres is using as its working set. That trades deploy downtime for a database that
  degrades on every deploy — a worse bargain than the one being fixed.
- `kayak_sse` is at **95.8%** of its limit and `kayak_backend` at **90.1%**. There is no slack to
  borrow even temporarily. (Both figures are also a standalone concern, deliberately *not*
  folded into M33 — see its non-goals.) **Corrected 2026-10-03:** these were `docker stats`
  readings, which count reclaimable kernel slab. Broken down from the cgroup, real (`anon`)
  usage is ~130 MB of 512M for `sse` and ~276 MB of 768M for `backend`; the rest is
  `slab_reclaimable` the kernel frees at the limit, with no OOM kill on record. See the
  decision-log row of that date. The beat-singleton argument below is unaffected.
- **`beat` is a singleton that schedules the missed-checkpoint shore-contact email.** Two beats
  means a real shore contact receives duplicate safety alerts. So beat must be excluded from any
  parallel stack and cut over separately — which removes most of blue/green's conceptual
  simplicity, independently of the memory argument. This is a safety constraint, not an
  efficiency one.

**What makes the chosen path cheap.** nginx runs on the host, outside the compose lifecycle, and
is therefore a switch point that survives the containers being replaced. It currently has no
`upstream` blocks — `proxy_pass http://127.0.0.1:5000` is hardcoded — so adding them is the
enabling refactor for everything else and is nearly free.

**The expensive prerequisite turned out to be already met.** Rolling replacement means old and
new code briefly run against the same schema, which demands expand-only migrations. An audit of
the last 15 migrations' `upgrade()` paths (not their `downgrade()` paths — the first pass of this
audit read the inverse operations autogenerate writes there and briefly overstated the problem)
found them additive except one `drop_constraint`. Expand-only already holds by habit; M33 WP4
writes it down as a rule, since rolling replacement makes it load-bearing rather than incidental.

**Maintenance mode is not the lesser alternative — it is the base layer.** A schema-breaking
migration genuinely requires old code to stop before the new schema lands, and no traffic-
switching scheme changes that. So maintenance mode is both the first increment (it converts a
deploy from a connection error into an honest 503 page) and the permanent fallback for the class
of deploys rolling replacement cannot serve.

**Deliberately not decided here:** whether `sse` ever joins the rolling path. `EventSource`
reconnects on its own, so dropping those connections costs a reconnect; M33 WP3 decides it, with
"exclude it and say so" the expected outcome.

**Unmeasured, and gating:** the *current* downtime window has never been timed. M33 WP0 exists to
do that before WP2/WP3 are built, and may well conclude that WP1 alone is the whole milestone.

---

## Open source — decided (M25 → decision 2026-09-12)

**Status (2026-09-12): decided — open the repository, deliberately as a user-acquisition move,
not a response to demand.** This reverses the 2026-09-05 "undecided" status recorded below. The
audit and the "how" decisions (licence direction, brand-not-licence) that follow are unchanged and
still the basis for execution; what changed is the *why*, and it's worth stating precisely because
it inverts the original framing: **the operator is not opening the code because a userbase wants
it open — there is no userbase yet to want anything. The operator needs a userbase, and
auditability plus a credible community-based-product story is the acquisition pitch used to get
one.** Practically: open-sourcing and the premium-integration broker (below) are now one move, not
two sequential ones — the open core is the trust/acquisition surface, and premium sits on top of
it from the start, sold as the thing that funds keeping the core open rather than as a later
add-on once self-hosters exist. See the "governing constraint" reasoning in `ROADMAP.md`'s
Strategy section for the parallel shift on the monetisation side (real hosting cost + a
near-finished product changed the calculus from "wait for a usage signal" to "have paid features
ready now").

**The original 2026-09-05 audit and reasoning, kept for the record — the "why" below no longer
governs the decision, but nothing in it was wrong, and the audit itself still stands:**

**The argument for.** An app that asks strangers for route plans, crew contacts and live position
can *say* it has no hidden second scope, or it can let anyone check. Auditability is a claim the
source can back, and no other artifact can.

**The arguments against, which is why it was not settled at the time.**

- **The audience that would exercise it is not the audience being launched to.** Kayakers arriving
  from a blog post do not read source; the people who audit are developers. The signal is real but
  largely symbolic, and its value scales with how many people are wondering whether to trust the
  operator — which at 1.0 was nobody yet. **Superseded by the 2026-09-12 reasoning above**: the
  point is no longer to reassure an existing audience, it's to reach the developer-adjacent
  audience *as* the acquisition channel.
- **Trust is not what is blocking the launch.** `/explore` served one route on 2026-09-05. What a
  visitor judges is the library, not the repository. Still true of the *library's* content — but
  no longer the reason to defer opening the repository, since the repository itself is now part of
  how a userbase gets built, not a response to one already judging the library.
- **Closed → open is available on any day; open → closed never is.** Deferring costs nothing
  recoverable and spends no irreversible move at the point of least information. This is the same
  asymmetry that governs licence direction, one level up. Still correct as a reason to be careful
  about licence direction (see below); no longer a reason to defer opening at all.

**A false premise was nearly acted on, in both directions.** The 2026-08-30 row below recommends
deferring, and gives as its obstacle that untracked planning material sits in the history, so
opening would need a fresh repository rather than a visibility flip. Checked 2026-09-05: the files
in question return **zero commits** on any branch — they have been gitignored throughout. The
obstacle does not exist and never did, and it was asserted without being checked. **Generalised:
`git log --all -- <path>` is one command, and a claim about what history contains should not be
made without running it.**

**The audit, which stands whichever way this goes**, run 2026-09-05:

- **No plaintext secret was ever committed.** Every secret-shaped path in the full history is an
  `.example` file, except one: `secrets/env.prod.sops` (added #129, removed #133 — the SOPS
  experiment that lasted a day). It carries 36 `ENC[AES256_GCM,...]` values, the `age` key never
  entered the repository, and the values have since been rotated.
- **Licensing is unencumbered.** A second human contributed 66 commits between 2022-10 and
  2023-08, which would ordinarily mean their permission is needed to license the work. Full-file
  `git blame` across every tracked source file attributes **zero surviving lines** to them —
  92,101 and 39,047 to the operator's two addresses, 2,763 to `noreply@anthropic.com`. Their code
  has been entirely rewritten out, so the work can be licensed unilaterally whenever the question
  is answered.
- **A fresh repository is not required**, per the correction above. Whatever is decided, it is a
  visibility flip on the repository that exists.

**Two things about *how*, settled in advance of the *whether*.**

- **Licence direction: start at the stricter end.** Relaxing a licence later is uncontroversial and
  can be done unilaterally; tightening one splits a community and invites a fork of the last
  permissive release. Starting permissive is the only choice that cannot be walked back, so it is
  the one to avoid. **AGPL-3.0 is the leading candidate** — it is OSI open source, so the
  description stays literally true, while its network-copyleft term deters commercial absorption
  without the project having to say anything about that anywhere. Source-available licences
  (BUSL-1.1, PolyForm Shield, Elastic 2.0) restrict a competing service outright but are **not**
  OSI open source, and a project whose pitch is auditability cannot afford the one claim in its
  README a developer audience would dispute on sight.
- **The brand does the work the licence should not.** The code would be open; the name and mark
  reserved. This is the arrangement the Android comparison actually describes — AOSP is Apache-2.0
  and entirely clonable, and what Google withholds is Play Services and the trademark, not the
  source terms. Reserving a name is unremarkable and costs no licence compromise.

**Dual-license option on `kayak-core` — deferred, but the CLA decision must land before it's
foreclosed (raised 2026-09-14).** The B2B console is not part of this question — it lives in
`kayak-premium` from day one and is never public, so there is nothing to "dual" there, it is
simply closed. The live option is a `kayak-core` dual-license (the MySQL/Qt/pre-SSPL-MongoDB
pattern): free under AGPL, or a paid commercial licence for a company that wants to embed/host it
without AGPL's network-copyleft disclosure obligation — a legitimate, proven revenue shape,
distinct from both the B2C and B2B rails mapped in `ROADMAP.md` and worth its own line there if
it's ever pursued. **Costs nothing to keep open today**: the audit already established clean,
unencumbered copyright on `kayak-core` (the one prior contributor's code was entirely rewritten
out), so the operator can offer both licences unilaterally right now. **That stops being true the
moment an external contribution is accepted** — an AGPL-only contributor's patch can't be
relicensed commercially without their consent, so a **CLA** (granting the right to relicense) must
be required on any external PR *before* the first one is merged, not retrofitted after. Not being
built now; recorded so the CLA question is decided deliberately when M32 execution starts, rather
than discovered after the option has already been lost.

**The monorepo split — a prerequisite of executing the decision, not a separate milestone
(surfaced 2026-09-12, while scoping premium mobile GPS/Bluetooth integration; widened the same day
once the B2B/Pro console was scoped as its own frontend).** The 2026-09-05 audit's finding that "a
fresh repository is not required — whatever is decided, it is a visibility flip on the repository
that exists" assumed an all-or-nothing flip. It no longer holds as stated: **mobile stays closed
source** (forced by a concrete case — Bluetooth GPS watch/satellite-feed integration,
`docs/adr/mobile-offline.md`'s M9f, has no third-party secret to gate on the way Strava/BYOK do,
so protecting it requires the *code itself*, not just an entitlement check, to be absent from
whatever goes public), and **the B2B/Pro admin console is a separate, closed frontend by the same
logic that already put mobile there** — it's the paid B2B product surface itself, not something
the consumer-trust pitch needs open. Both move into the existing private **`kayak-premium`** repo
alongside the Premium Broker BE, rather than either getting its own separate private repo — one
private home for everything closed (Broker BE + mobile app + B2B console frontend), not three.
`backend/` and `frontend/` (the consumer web app) go public as **`kayak-core`**; nothing else does.
Git visibility is per-repository, not per-directory, so one monorepo containing all of this can't
be half-flipped — the audit's "no fresh repo" conclusion needs a real repo split (mobile and the
B2B console extracted into `kayak-premium`) before `kayak-core` can actually be published, not
after. **Open question, not yet decided**: whether Club-admin features (once the missing
`Club`/`Organization` schema exists) belong on this same B2B console rather than in the consumer
app — both are "manage a group of paddlers you're responsible for," a different job from personal
trip planning, so the console may end up the natural home for both Pro and Club-admin, not Pro
alone.

**Sequencing: tied to when open-sourcing is actually executed, not to a mobile-maturity date.**
Discussed and left deliberately unpinned — there's no value in guessing a calendar trigger now,
because nothing is blocked while the monorepo stays private (M9f isn't being built yet, and
backend/frontend aren't public yet either). The split is a **prerequisite step of whatever plan
eventually executes the open-source decision**, checked for "is mobile mid-churn right now" at
the point that plan actually starts, not scheduled independently of it.

**Two separate things not to conflate: repo-split timing vs. console-build timing.** *When the
repos get split* is gated on the open-source execution date, as above. *When the B2B/Pro console
actually gets built* is a much larger, independent bet — closer in size to M26 than to BYOK/Strava
— and per `ROADMAP.md`'s Strategy section, the small integrations (BYOK, then Strava) are
sequenced first precisely because a console-sized build competes for the same limited capacity.
The repo structure can and should exist before the console does; building into `kayak-premium`
from day one avoids ever having to migrate B2B console code out of the consumer frontend later.

**The one real coupling the split has to solve: `frontend/lib/*` reuse.** M9b's own milestone note
records that mobile reuses `frontend/lib/*` directly for DTOs and pure formatting helpers, on the
strength of being in the same monorepo. Once split, that becomes a **public npm package** (not
private) — `frontend/lib` is part of Core and going public regardless of what mobile does, so a
private registry would add real ongoing operational cost (a paid private npm org, or a
self-hosted registry to run) for zero actual confidentiality benefit, since the source is visible
in the public frontend repo either way. Mobile's now-private repo depends on it via an ordinary
`npm install`, no auth. Worth a quick check when this is actually scoped: confirm nothing in
`frontend/lib/*` that mobile imports was written assuming "only ever consumed by a private
frontend" and never re-examined against going public.

**A named risk for the day it is opened.** The candour of these documents is exactly what would be
published, and the failure mode is that they quietly turn into marketing copy. A decision log that
stops recording the unflattering half is worth less than no decision log. Related: collaborators
are a hoped-for side effect and not a justification — most niche projects receive no external pull
requests, so contribution infrastructure should not be built ahead of a contributor.

**Separately, and not contingent on any of the above: the `noreply@anthropic.com` commit authorship
is to be corrected.** The operator is the author — he directed the work and holds the copyright,
and Anthropic asserts no authorship over outputs. A git `author` field naming an assistant does not
say "assistance was received"; it says the assistant *is* the author of that commit, which is a
stronger claim than the true one, and it entered the history through an agent acting against a
preference the operator had already stated rather than through any decision. Correcting it is not
editing the record — the record is currently wrong. Assistance is disclosed in prose instead, where
it is both accurate and legible to a reader who will never run `git log`. Scope, measured
2026-09-05: **22 commits** authored and committed by that address (2026-07-03 → 2026-08-23), plus
**18** carrying `Co-Authored-By: Claude …` trailers (2026-06-05 → 2026-09-05, i.e. still being
added); the **21** dependabot co-author trailers are legitimate and must survive. `git
filter-repo --mailmap` does both in one pass — a clone-and-rebase would mangle the real merge
commits — and rewrites **617 of 1129** hashes, so it needs a moment with no open PRs and no live
worktrees. **The source is still open:** a trailer was added on 2026-09-05 by a session that had
the stored preference available to it, so cleaning history without closing that just refills it.

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
| Logfire base wiring | ADR-009 | 2026-07-24 | `LOGFIRE_TOKEN` env var; `Api/observability.py` `setup_logfire()` called from `createApp()` — `logfire.configure(send_to_logfire="if-token-present", console=False)` + `instrument_flask`/`instrument_sqlalchemy`/`instrument_celery`. No-ops cleanly without a token (CI/tests unaffected). `RequestContextFilter` now also injects `trace_id`/`span_id` from the active OTel span into `JsonFormatter` output. ProxyFix must wrap `app.wsgi_app` *after* `setup_logfire()` so it stays the outermost WSGI layer (resolves real client IP before OTel tags spans with it) |
| Logfire M13 §A.2/§A.3 — SSE guardrail + frontend | ADR-009 | 2026-07-24 | Per-process `service.name` (`_resolve_service_name`); tile proxy/health/SSE routes excluded from Flask auto-tracing, replaced by one manual `logfire.span` per SSE connection (`LiveStreamService.stream_events`) instead of one per 15s tick — verified live via `curl -N`. `frontend/instrumentation.ts`: `@vercel/otel` + a Logfire OTLP exporter whose region is resolved from the write token itself (`logfire`'s `resolveBaseUrl`), gated on `LOGFIRE_TOKEN`/`NEXT_RUNTIME=nodejs`; verified one connected trace end-to-end (server action → `apiFetch` → Flask → SQLAlchemy). Budget guardrail: Personal (free) plan hard-stops ingestion at 10M records/month automatically — no dashboard config needed at this tier. Browser RUM and Sentry remain deferred |
| Logfire M13 — four pre-existing/introduced bugs found + fixed while verifying trace_id correlation and FE↔BE trace linking | ADR-009/ADR-010 | 2026-07-24 | (1) `RequestContextFilter` was attached to the root **Logger** (`addFilter`), not its **Handlers** — Python only invokes a Logger's own filters for records it directly originates, so every child-logger call (`Resources.*`, `Services.*`, i.e. all real application logging) silently skipped it; `request_id`/`trace_id`/`span_id` had never reached a real log line. Fixed in `Api/logging_config.py`; regression-guarded in `Tests/70_logging_context_filter_test.py`. (2) `Api/celery_app.py` left Celery's `worker_hijack_root_logger` at its default `True`, so the worker/beat processes wiped `setup_logging()`'s handlers at bootstrap and replaced them with Celery's own plain-text formatter — every task log line lost JSON formatting and correlation fields. Fixed via `worker_hijack_root_logger=False`. (3) `frontend/instrumentation.ts` had no `instrumentationConfig` — `@vercel/otel`'s fetch instrumentation only propagates W3C trace context to Vercel's own deployment URLs by default, silently excluding this self-hosted backend; every `apiFetch` call created its own disconnected trace instead of continuing the frontend's. Invisible on page-load GETs, confirmed broken once a POST mutation was checked specifically via a direct Logfire Query API call. Fixed via `instrumentationConfig.fetch.propagateContextUrls: [API_URL, SSE_URL]`; regression-guarded in `frontend/__tests__/instrumentation.test.ts`. (4) None of `setup_logfire()`'s `instrument_*` calls touch stdlib `logging` — added `logfire.LogfireLoggingHandler()` so application logs reach Logfire itself, not just stdout; uncapped, this forwarded every third-party DEBUG line and duplicated Logfire's own outbound-call logs via the handler's fallback (suppressed-instrumentation StreamHeader), so capped it at `INFO`. Regression-guarded in `Tests/71_observability_test.py`. All four verified live: a triggered `Tasks.ping.ping` emits JSON `task_started`/`task_completed` with matching `trace_id`/`span_id`, and a direct Logfire Query API call confirmed `parent_span_id` linkage frontend→backend→SQL for both a GET and a POST/PATCH mutation |
| `excluded_urls` silences the Flask span and nothing else — the A.0.4 guardrail was only ever half-applied | ADR-009 | 2026-08-24 | Found by the Logfire record budget draining with no traffic to explain it. M13 §A.0.4 named the cost correctly ("one unbounded SQLAlchemy span per tick per viewer") and then applied a fix that does not address it. `excluded_urls` removes the **per-request Flask span**; the handler's own I/O is recorded by a *different* instrumentor and survives untouched — worse, having lost the parent it would have nested under, it arrives as an unparented top-level trace, so the exclusion made the noise more conspicuous while removing the cheaper half of the cost. All three excluded routes leaked: `/health`'s `SELECT 1` (polled every 10s by **both** the backend and the SSE sidecar — ~17k spans a day, and by far the largest source, ahead of SSE), the tile proxy's upstream `requests.get` (30-60 per map view on a cold cache), and the SSE per-tick `SELECT trip` — which is not merely "every 15s", since the loop also turns on every relayed position, so an active expedition traces harder than an idle one. Fixed at each call site with `logfire.suppress_instrumentation()`, the gate every OTel instrumentor checks before creating a span; greenlet 3.x keeps contextvars per-greenlet, so one SSE greenlet's suppression cannot leak into another under the gevent sidecar. Deliberately scoped to the I/O and not the whole request, so `health_check_failed`/`tile_upstream_failed` still reach Logfire — they are the only alert-worthy part of those requests, and the pre-production alerting item names uptime-kuma on `/health` specifically. **The original live verification is why this survived**: `curl -N` did produce one connection-scoped span in the UI, exactly as recorded — checking the top-level trace list answers "is the connection one trace?" and never "what is nested inside it?". Guarded end-to-end now: `Tests/71_observability_test.py` drives an excluded route and asserts **zero** spans reach a recording span processor, with a positive control on an unexcluded route so it cannot pass vacuously; the SSE and tile paths assert through the instrumentor's own `is_instrumentation_enabled()` gate, since monkeypatching `requests.get` replaces the very function the instrumentation wraps. A table test over the patterns also caught the unanchored regex swallowing `POST .../stream-ticket` |
| Thin resources / service layer | ADR-014 | 2025-01-01 | — |
| Self-hosted architecture | ADR-016 | 2026-05-09 | Logfire is the only managed exception |
| Object storage moves to Cloudflare R2 in production; MinIO stays in local dev | amends ADR-005 / ADR-016 | 2026-08-23, done 2026-08-26 | The second managed exception to the self-hosted principle, and the first involving *user* data rather than telemetry. Driven by egress, not by storage cost: residential upstream is the binding constraint and a mobile client loading route photos is the heaviest egress path this product has — R2 charges nothing for it, and a custom domain in front of the public bucket adds CDN caching. **Shipped 2026-08-26 to both staging and production**: two-bucket split live, MinIO retired from production object storage (stays for local dev), `storage.<domain>` vhost retired. No data migration was needed — both object stores were still empty at cutover. Cloudflare is already inside the trust boundary via the Tunnel, so this is a second product from an accepted vendor rather than a new relationship. **Cloudflare Hyperdrive was evaluated in the same pass and rejected** — it is a Workers binding that exists so edge functions can pool connections to a remote database; this backend is a Flask container talking to Postgres on the same Docker network, so it would route localhost-adjacent traffic out to Cloudflare and back for nothing. **Still open:** object versioning is not yet confirmed enabled (the offsite-backup item's MinIO→B2 half stays until it is), and `StorageService.move()`'s cross-bucket copy path (the M19 public/private image toggle) needs re-verification under the live split. Detail in "Object storage" above |
| R2 API token is **not** IP-restricted | amends ADR-016 | 2026-08-23 | Considered and declined, with the Cloudflare Tunnel named explicitly because it is the intuition that prompts the question and does not apply: the Tunnel carries **inbound** traffic, while the backend calling R2 is **outbound** over the ordinary ISP connection, so R2 sees the residential IP and there is no tunnel address to allowlist. Two reasons against, the second decisive. (1) The home IP is dynamic — Nextcloud runs dynamic DNS on the same box — so a pinned token turns a DHCP lease renewal into a storage outage. (2) **It would break private downloads for every user.** Presigned URLs are signed with these same credentials; generating one is a local computation and would keep working, but the browser then fetches the object *from the user's IP*, which an IP filter rejects. Uploads would keep working while every document, private route photo and GDPR export download failed — a failure mode that reads as a bug, not a config. (Mechanism inferred from how S3 evaluates IAM IP conditions against presigned requests; not tested against R2 specifically, and not worth gambling on R2 being the exception.) Protection lives in **scope** instead: the token is limited to the two buckets with **Object Read & Write, not Admin**, so a leak cannot delete a bucket, flip the private one public, or detach the custom domain — and the runtime has needed object CRUD only since M11 §4. Revisit at the DigitalOcean move, where a static IP removes reason (1); reason (2) persists, so wanting it there means splitting credentials — an IP-pinned token for server read/write plus a separate unrestricted Object-Read-only token used solely for presigning, i.e. a second client in `storage_service.py` |
| R2 API token has **no expiry**; rotation is a calendar reminder | amends ADR-016 | 2026-08-23 | A TTL bounds the damage of a leak *nobody noticed* — narrow, because a noticed leak is revoked instantly at any time, no waiting for expiry. What it costs is a **silent outage on a timer**: at expiry both uploads and presigned downloads stop, at whatever hour it lands, and there is deliberately no alerting until after the Play closed beta (see the Observability checklist's re-scoped alerting item). Rotation is also manual — editing `.env` on the box and restarting containers — so a 30-day TTL is twelve chances a year to paste a secret wrong and cause the outage it was meant to prevent. A token TTL is a control that pays off with automated rotation or expiry monitoring; with neither, it converts a security control into an availability risk. Defensible rather than lazy because the blast radius is already small (scoped token, no Admin) and a manual six-monthly rotation reminder keeps the hygiene while making the failure mode "you forgot" instead of "production broke at 3am". Revisit when alerting exists (the expiry would then be noticed) or at DigitalOcean with a secrets manager (rotation automatable) |
| Outbound mail moves from SMTP to Brevo's HTTP API in production | amends ADR-016 | 2026-09-06 | DigitalOcean blocks outbound SMTP (25/465/587) on every droplet, unconditionally — confirmed directly with DO support, not liftable by a ticket, and not something the DO Cloud Firewall or `ufw` control (both were checked and ruled out; the block sits below both). Discovered when a real registration hit the "you're already registered" email path in production: `smtplib.SMTP().connect()` has no timeout, so it hung until Gunicorn's hard 30s worker timeout `SIGKILL`ed the process — one mail failure took the whole request down with it, not just the email. Fix: `BREVO_API_KEY` (`Services/mail_service.py`, `docker-compose.prod.yml`) switches the transport to `POST https://api.brevo.com/v3/smtp/email` over HTTPS, which nothing blocks, with an explicit 10s timeout so a future provider hiccup fails one request cleanly instead of a worker. Chosen over adopting a new provider (SendGrid, Mailgun, Postmark — DO's own suggestion) specifically to keep the domain's existing SPF/DKIM/DMARC setup untouched — only the transport changes, not the provider or the DNS. SMTP config (`MAIL_SERVER`/`MAIL_USERNAME`/`MAIL_PASSWORD`) stays: local dev and CI/testing send through `mailpit` over SMTP unaffected, and `send_template_email` falls back to it if `BREVO_API_KEY` is ever unset — which on a production box means **no mail sends at all**, not a degraded mode. Diagnostic method worth reusing: raw `/dev/tcp` connect tests from the box itself, against more than one destination host and port, before assuming which layer (provider, firewall, ISP) is responsible |
| Cloudflare's secrets products rejected; `.env` stays, with the trigger refined | amends ADR-016, amends root `CLAUDE.md` "Secrets Management" | 2026-08-23 | **Cloudflare Workers Secrets / Secrets Store are bound to a Worker** — the consumption model is a binding in edge compute, and values are not readable back out by design. This backend is a container talking to a local Postgres, so there is nothing for a binding to attach to: the same architectural mismatch that rejected Hyperdrive, from a different product family. On secrets management generally, the honest finding is that **the present risk is loss, not leakage**. The classic benefits — access auditing, automated rotation, distribution to many consumers — have no one to serve at one operator and one box, while `.env` exists in exactly one place with no offsite backup: a dead disk loses `JWT_SECRET_KEY` (logging out every user), the DB password, the Brevo credentials and now the R2 token, to be reconstructed from memory mid-outage. Proportionate answer: both `.env` files into a password manager today; **SOPS + `age`** if versioning is wanted (encrypted `.env` committed, key in the password manager — backup, history and not-plaintext-on-disk with no server and no boot dependency). Doppler or Infisical at the DigitalOcean move; Vault is for organisations with a team to run it. **Trigger amended**: root `CLAUDE.md` said "revisit when a staging or production server is provisioned", which fired on 2026-07-31 and was quietly overrun. Provisioning one box for one person does not change the threat model — a **second operator, a second machine, or a CI pipeline holding secrets** does, and M9's mobile build pipeline brings the third |
| Production secrets move to SOPS + age, encrypted in the repo | amends ADR-016, follows the 2026-08-23 row above | 2026-08-24 | Prompted by an actual outage rather than a principle: the production `.env` had been `scp`'d to the box once and then drifted, so the local copy carried variables the server had never had, **nothing could show the difference**, and the first symptom was compose refusing to start on a variable name that meant nothing by itself. (The trigger was a change of mine that made `STORAGE_SECRET_KEY` required without a migration note — but the drift was the standing condition, and the next change would have found it too.) `secrets/env.prod.sops` is committed; the server gets it with `git pull`, so there is exactly one copy. **Only values are encrypted — variable names stay in plaintext**, which is the point: `git diff` shows which variables were added or removed without exposing them, making drift a review artefact instead of a 3am symptom. **Two separate age keypairs**, which is the subtle part: the deploy key's private half must live on the server because that is where decryption happens, while the backup key's private half must never be there — reusing one key would silently destroy the property that makes `scripts/backup-db.sh` worth having. Verified in a container before shipping: byte-identical round trip, wrong key refused, variable names readable without the key. One real gotcha found doing so — sops matches its creation rule against the **input** path, so `sops --encrypt .env > secrets/…` fails with "no matching creation rules found"; the file must be moved to the matching path and encrypted in place, which is why `scripts/env-encrypt.sh` exists rather than a documented one-liner. **At the DigitalOcean move this does not need replacing** — "encrypted file in repo, private key on box" is identical on a droplet. What retires it is a CI/CD pipeline holding secrets (M9 mobile builds, automated deploys), since that hands the key to a machine that is not the operator's; Doppler or Infisical then |
| SOPS removed the same day; config reaches the box by `scripts/deploy-sync.sh` instead | reverses the SOPS row above | 2026-08-24 | The SOPS design assumed the server had a **git checkout** to pull the encrypted file into. It does not — deployment there is a folder of hand-copied files running prebuilt GHCR images, which is also the root cause of the drift SOPS was adopted to fix (and of *both* outages that day: a stale `docker-compose.prod.yml` and a stale `.env`). Adding a checkout was possible — a sparse one is ~3 MB with no application source, verified — but the repo is private, so it needs a read-only deploy key on the box, and it changes a deployment model that otherwise works. `deploy-sync.sh` rsyncs the whole deploy set over SSH from the dev machine instead: same fix for drift (a subset cannot go stale when everything is pushed every time), no checkout, no new credential. **With the file delivered directly over SSH, the encryption guarded nothing** — there is no third party in the path — while still costing a keypair to manage, so it went. The rule kept from the exercise, and worth more than the tooling: **encrypt by where the data ends up.** Own box over SSH, no; Backblaze, yes — which is why `backup-db.sh` stays encrypted. Two costs accepted knowingly: `.env.prod` now exists only on the dev machine (password manager is the only backup — the "loss, not leakage" risk from the 2026-08-23 row, undiminished), and the drift is *prevented* rather than *visible* — a checkout can answer "does the box match?" on demand, a push cannot. The already-committed ciphertext stays in git history; it is inert without the deploy key, which can be discarded |
| Static type checking with mypy | ADR-029 | 2026-06-19 | Gradual, layer-by-layer; for correctness/tooling not perf; `TYPE_CHECKING` `Base` shim for `db.Model` |
| E2E backend mirrors prod concurrency (gunicorn, not `flask run`) | ADR-030 | 2026-06-22 | Single-threaded dev server serialized the 7-call trip-detail fan-out → flaky post-mutation assertions; M6b's +2 calls tipped it over. Full revalidation breadth stays (member-removal cascades); fix is concurrency, not caching. Aggregate `/api/trip/:id/detail` tracked separately |
| API versioning — URL-path `/api/v1` | ADR-031 | 2026-06-26 | Hard-cut all routes to `/api/v1` before mobile/PWA-offline clients ship (independently-deployed → need versioning); URL-path over header negotiation; frontend versions centrally in `apiFetch` (callers unchanged); v2 will be a parallel blueprint set, not an in-place rewrite |
| OpenAPI contract shipped (M13 Part B) | ADR-031 | 2026-07-24 | "Deferred to an M9 prerequisite" resolved ahead of M9a. `apispec` + its Marshmallow plugin — `Api/openapi.py` walks the registered route table (`app.url_map`) rather than hand-maintained per-view YAML docstrings for path/method coverage, so it can't drift from the actual routes; every Marshmallow schema in `Schemas/` is discovered and registered as a component the same way (module walk, not a hand-listed import), so "no second, hand-maintained schema definition" holds structurally. Auth requirement (`security: bearerAuth`) is read from a marker (`_auth_required`) `JWTService.authenticate_restful` sets on its own wrapper — `functools.wraps`' `__dict__` copy propagates it through any further stacked decorator, so this reflects the real decorator stack rather than a third list to keep in sync. Public, no auth (`GET /api/v1/openapi.json`, Swagger UI at `/api/v1/docs`) — read-only schema metadata, decided explicitly rather than defaulted. Validated in CI via `openapi-spec-validator` against the live-generated document, not a committed static file. Representative routes (`trip`, `live`, `itinerary`, `tile`) enriched with real Marshmallow-schema-linked YAML docstrings as proof the wiring works end-to-end; full per-route enrichment across all ~29 resource files is progressive follow-up, not blocking — every route already has correct path/method/auth coverage regardless |
| SSE via hybrid Flask-gevent sidecar (M8) | ADR-033 | 2026-07-17 | Ranked hybrid sidecar > gevent-everywhere (recorded fallback) > ASGI sidecar. Same image, Celery-style second gunicorn (`SERVICE_ROLE=sse`, `--worker-class gevent`, dedicated `wsgi_sse.py` with monkey-patch + psycogreen quarantined to it); proxy path-routes `/api/v1/live/*` streams to it. Stream endpoints I/O-thin by rule. Crew stream auth = short-lived `purpose:"live-stream"` JWT ticket minted by the main API (EventSource can't send headers; cookies live on the Next origin), route also accepts a plain `Authorization` header (checked first) so M9's React Native client — no `EventSource` constraint, token already in `expo-secure-store` — authenticates the same as any other API call without a later route change. Redis db/3 allocated for `live:trip:<id>` pub/sub. Future rider: trip-collab notifications over the same path |
| Production hardening scoped as M11 | ADR-032 | 2026-07-04 | 2026-07-04 site evaluation remediation crystallized in `plans/M11.md`: refresh rotation + reuse detection on `token_version` (no server-side token store); security headers in Next.js not Flask; honest CI (blocking lint, `next build`, migration run + drift check, Dependabot/audits); seeding out of app factory; bucket provisioning to `minio-init`; ProxyFix at deploy; OpenAPI deferred to M9 prerequisite |
| Deployment hosting — home-first pipeline, DO as graduation target | ADR-034 | 2026-07-27 | Full stack (Postgres/Redis/RabbitMQ/Flask/Celery/Next.js) self-hosted on a home box during the pre-traction phase, reached via Cloudflare Tunnel (not port-forwarding — sidesteps CGNAT, hides home IP, auto-TLS) once a domain exists; Nextcloud's existing dynamic-DNS setup untouched, kayak app gets its own Cloudflare-managed DNS. `autosuspend.conf` gains a connection-state check alongside the bandwidth threshold so low-volume dev/mobile chatter can't suspend a live session. Comparative reasoning behind the DigitalOcean pick kept outside this document. Bright-line graduation trigger fixed in advance: move to DigitalOcean the moment a non-trusted-circle user or money is involved, not re-litigated per incident |
| Image publishing moves from every-merge to release tags | ADR-034 | 2026-08-02 | `:latest` moved on every merge to `master`, so "what is deployed" was only answerable by correlating GHCR push timestamps against the commit log, and redeploying a known-good build meant hand-editing `image:` lines. Publishing now lives in one `release.yml` triggered by a `v*.*.*` tag (or a manual `workflow_dispatch`), builds **both** images regardless of which paths changed — per-workflow path filters keep CI fast on a one-line change, which is the opposite of what a release wants — and publishes `:vX.Y.Z`/`:sha-<short>`/`:latest`. Backend and Frontend CI stay as gates and build nothing. The workflow refuses to publish a commit that is not an ancestor of `origin/master`, which is why it does not re-run the suites itself; a manual run on a branch publishes a sha tag only and never moves `:latest`, since `:latest` pointing at something with no version behind it is the problem being fixed. `docker-compose.prod.yml` takes `KAYAK_IMAGE_TAG` (default `latest`) so rollback is a tag change, not a rebuild — code only, since `migrate` never downgrades. PR #100; runbook in `DEPLOY.md` |
| Graduation trigger amended — closed beta stays home-hosted | ADR-034 | 2026-08-23 | The original bright line was "move to DigitalOcean the moment a non-trusted-circle user or money is involved." A Play Store **closed test** technically trips it — testers are strangers — while being a dozen accounts behind Cloudflare Tunnel, which is a load the home box carries comfortably and an exposure the Tunnel already mitigates (the home IP is never public; that is why the Tunnel was chosen). Amended rather than overrun in silence, because a bright line that goes unhonoured stops being one: **move to DO at open/production release on Play, or at first paying user, whichever comes first.** Closed testing runs at home. Two riders. (1) This defers hosting, **not** offsite backups — see the redundancy-tier table; the backup deadline moved *earlier* in the same pass, because the argument for deferring hosting (small load, mitigated exposure) says nothing about losing the box. (2) `autosuspend`'s connection-state check protects a live session, not a cold wake — a tester opening the app at dawn on a beach against a suspended box needs testing before the beta, not after |
| Per-device sessions + instant revocation | ADR-035 | 2026-08-02 | Extends ADR-001/032, does not supersede them: access tokens stay stateless and gain a `sid` claim; a `Session` row per device makes revocation family-scoped, so reuse detection and per-device sign-out cost one device rather than all of them. Instant revocation via a Redis `/4` denylist keyed on `sid`, TTL = access-token lifetime, **failing open** (a Redis blip must not log out the platform). 15-minute access lifetime kept — with instant revocation it is a refresh-cadence parameter, not a security window. No benign-reuse grace window (indistinguishable from the attack; single-flight on the client instead) and no reuse-detection email (would cry wolf; the sessions list is a pull channel). Coarse city-level location resolved in-process from the Cloudflare Tunnel's location headers, trusted only behind `PROXY_TRUSTED_HOPS`, stored as a label and never as an IP. Deploy cost: every user is logged out once, since pre-M17 tokens carry no `sid`. `plans/M17-per-device-sessions.md` |
| Testing standards — assertion completeness over coverage % | — | 2026-08-04 | M15 scoping: 71% of frontend test files (143/201) never exercised a failure path; coverage % is explicitly not the target since it scored the M14 orphan leak as green. 7-point rubric frozen here + `frontend/CLAUDE.md` before any sweep work starts (M15 Wave 0) |
| Deployment hosting — domain live, first real deploy (ADR-034 execution) | ADR-034 | 2026-07-31 | Domain `kayaktrek.app` purchased, DNS on Cloudflare. Refinement over the original ADR-034 text: `cloudflared`↔nginx loopback hop is also TLS (defense-in-depth, not required by Tunnel itself), via a real certbot-dns-cloudflare Let's Encrypt certificate rather than a Cloudflare Origin Certificate — same auto-renewing path as every other domain on the box, no reliance on `cloudflared`'s special-cased trust of Cloudflare's own Origin CA, and DNS-01 needs no port 80 exposure (there is none). Frontend vhost is the bare apex, not an `app.` subdomain — there's no separate marketing site (landing/auth/dashboard are one Next.js deployment), so `app.` would be an unneeded extra subdomain; decided and switched before any real user had it bookmarked. Fourth vhost added for MinIO's S3 API (`storage.<domain>`) — public-read avatars/point-images and presigned downloads bypass Flask entirely, so MinIO needs its own public hostname (admin console stays 127.0.0.1-only). Five real, first-time-ever-exercised bugs surfaced getting the pipeline's actual first `push`-to-`master` and first `docker compose up` to succeed — none were reachable from local dev or PR-only CI, since nothing had ever run the `push`-gated `docker-build-push` job or hit a real production domain before: (1) `toLower()` isn't a real GitHub Actions expression function — an invalid expression invalidates the *entire* workflow file regardless of which job references it, silently blocking all CI (including `pull_request`, unrelated to the broken job) since the pipeline's first commit; (2) the runner's default `docker` driver doesn't support `cache-to: type=gha`, needing an explicit `docker/setup-buildx-action` step; (3) the frontend build's static generation hung on an unbounded `fetch` to the (not-yet-deployed) production API instead of degrading via its own already-correct empty-fallback path — fixed with `AbortSignal.timeout`; (4) `migrate` never had `RATELIMIT_STORAGE_URI`, which `ProductionConfig`/`StagingConfig` require at import time (M11 hardening) — every other service already set it; (5) a pre-existing DNS record at the zone apex (likely auto-created at domain registration) silently rejected every `cloudflared tunnel route dns` attempt for it, so Cloudflare had been proxying the apex to that stale record the whole time. Full narrative and current live/paused status: `DEPLOY.md`'s "Status" section |
| Graduation trigger reworded a second time — capacity, not calendar | ADR-034 | 2026-08-30 | The 2026-08-23 amendment set the line at "open/production release on Play, or first paying user." The first half is a **calendar** event while the actual reason to move is capacity and reliability, and a trigger that does not name its own reason is the shape that got quietly overrun on 2026-07-31. Reworded to three conditions that would be *noticed* firing: **a paying user** (money creates an obligation a free beta does not), **sustained concurrency past what the box handles**, or **a second outage caused by the house rather than by the app**. The cost comparison that forced the re-examination: €24/month buys a 4 GB / 2 vCPU droplet — a third to a half of the box — against ~€3–5/month of power, and at single-digit concurrency neither throughput nor the residential uplink is a factor. Two things make home-hosting stronger than the original ADR assumed: the 2026-08-26 R2 migration already moved the heaviest egress path (route photos, avatars) off the house, and Cloudflare Tunnel keeps the move a DNS/target change rather than a re-architecture, so deferring locks nothing in. What the €24 was implicitly buying is **disaster recovery and uptime independent of the house** — so this deferral is only defensible now that offsite backups are running *and restore-rehearsed* (2026-08-30) and `uptime-kuma` is configured; both stopped being optional the moment the money argument won. `autosuspend` settled alongside: `keep-awake` lock on for the beta, `sleep-now`'s daily RTC wake 08:00 → 05:30 as the fallback. Wake-on-request was considered and is **structurally unavailable** — `cloudflared` runs on the box, so nothing can reach it while suspended; it would need an always-on second LAN device, and `sleep-now` reboots on resume for the USB RAID anyway, making the wake path minutes rather than seconds |
| **DigitalOcean migration decided — on operational burden, not on load** | ADR-034 | 2026-08-31 | **No trigger fired.** The move happens anyway, and the record says so rather than pretending a bright line was crossed. ADR-034's graduation trigger has now been written three times — "a non-trusted-circle user or money is involved" (2026-07-27), "open release on Play, or first paying user" (2026-08-23), "a paying user, sustained concurrency, or a second house-caused outage" (2026-08-30) — and **all three were about scale**. What actually decided it was **operational surface**, which none of them names: Kuma cannot report its own host being gone (the row below), fixing that at home meant building a Cloudflare Worker plus a KV namespace plus a cron trigger plus a notification integration plus a heartbeat endpoint, the backup schedule needed a systemd timer specifically because `autosuspend` breaks cron, and `autosuspend` itself needed a `keep-awake` lock and an earlier RTC wake because wake-on-demand is structurally unavailable (`cloudflared` runs on the box, so nothing can reach it while suspended). None of that is load; it is the scaffolding a home box needs to behave like a server, and a $24/month droplet includes most of it — off-droplet control-plane alerting, nothing suspending, cron working. **The €3–5/month power comparison was not wrong, it was incomplete**: it priced CPU and RAM and not the operator time required to make an intermittently-suspended residential machine trustworthy with other people's medical notes. **Lesson, and the reason this is the last rewording: a trigger phrased in terms of the metric you expect to grow will not fire when the real cost is somewhere else.** Sizing set from live `docker stats` (≈1.28 GiB idle across nine services, against 4.7 GiB of declared limits — limits are ~3.7× reality and were the wrong number to size on): **4 GB / 2 vCPU**, with 2 GB rejected on headroom and DO Managed Postgres declined because the live reading shows Postgres using 62 MiB, so moving it off frees nothing that would unlock a smaller droplet. Plan: `plans/M21-do-migration.md` |
| Detection resolved — the retired box becomes the monitor | ADR-034 | 2026-08-31 | Closes the open half of the row below, and by a cheaper route than anything that row proposed. A Cloudflare Worker (cron + KV + Brevo API + heartbeat endpoint) was designed, and Healthchecks.io's free tier costed; **neither was needed.** The M21 migration itself supplied the answer: once the app moved to a droplet, **the home box became a genuinely independent observer** — different machine, different network, different provider — so `uptime-kuma` stays exactly where it is, repointed at the public URLs, with its existing Brevo notification channel. Two layers, no new vendor and no new account: **DO's alert policies and uptime checks** run on their control plane (always up, off-droplet by construction) covering droplet-down, CPU, memory, disk and public URL reachability; **home-box Kuma** covers app health, tunnel-vs-app diagnosis, RabbitMQ and the backup heartbeat during its waking hours. The waking-hours limit is accepted deliberately — a droplet dying at 02:00 is noticed at wake, and the testers are European paddlers not on the water at 03:00. One real consequence for the backup job: `kayak-backup.timer` moved **03:17 → 09:17 UTC**, because a success ping fired at a suspended receiver fails rather than queues, so a night run would have left Kuma waking to no heartbeat and false-alarming every morning — and a monitor that cries wolf daily gets muted, which is worse than none. **Residual, named rather than solved:** a monitor that silently stops looks identical to "everything is fine", so if the home box fails to wake no mail arrives either way; DO's layer covers the important half of that |
| A box cannot monitor itself — detection moves off-box | ADR-034 | 2026-08-31 | ADR-034 flagged a "silent failure" gap for the home-hosted path, and `uptime-kuma` was adopted against it. It does not close it, for a reason that is structural rather than configurational: **Kuma runs in `docker-compose.monitoring.yml` on the box it watches**, so a dead host is a dead Kuma, and the failure modes that most need an alert — power cut, ISP drop, kernel panic, an unintended suspend — are exactly the ones it cannot report. The 2026-08-30 write-up claiming it "catches the box being gone" was precisely backwards and is corrected in `CLAUDE.md` and `DEPLOY.md`. **Kuma is re-scoped as a diagnostic panel, not a detector**, and keeps real value in that role: service-level failures while the host is alive, and the public-vs-local monitor pair that separates a tunnel fault from an app fault. **Detection needs two things off the box**, neither built: an external URL monitor on the health endpoint (UptimeRobot / Better Stack free tier, or a Cloudflare Worker on a Cron Trigger — that one also exercises the real public path through DNS, Cloudflare and the tunnel, which is what a user experiences), and a **dead-man's switch** for the backup job, since `BACKUP_HEARTBEAT_URL` currently points at Kuma's push monitor and so inherits the defect twice over — a box that is off neither runs the backup nor reports the miss. Both assume the box is meant to be up continuously, which the beta's `keep-awake` lock provides; re-enabling `autosuspend` later means giving the external monitor a maintenance window or being paged nightly. Generalised: **the monitor and the monitored must not share a failure domain**, which is the same reasoning that put database backups on Backblaze rather than beside the objects in R2 |
| Beta surface split — app keeps the apex, `get.` is the always-up half; no perimeter gate | ADR-034 | 2026-08-30 | Scoping the Play closed beta. **The app stays at `kayaktrek.app`**, which reverses nothing and costs nothing: no cert SAN edit, no `cloudflared` ingress change, no `FRONTEND_URL`/CORS/CSP/cookie-domain churn, no already-issued float-plan or story share link breaking. The 2026-07-31 row justified the bare apex on the grounds that "there's no separate marketing site" — that premise now changes, but the conclusion survives, because the promo site is not a landing page: the app's own chart hero already pitches at the apex. **`get.kayaktrek.app` is a separate static site on Cloudflare Pages from its own public repo**, carrying only what must survive the box being asleep — privacy policy, terms, account-deletion instructions, support contact, store badges, issue tracker. Public repo with Issues is the **cheap half of opening up** without opening the app source (you can open later, never close later; `ROADMAP.md` and `docs/reviews/` are in the history, so opening means a fresh repo, not a visibility flip) — it is a public repo, not an open-source project, and takes no license badge. **htpasswd was rejected**: `frontend/app/(public)/` is six anonymous-by-design routes plus the landing map, float-plan links are the shore-contact *safety* path, and `EventSource` cannot send an `Authorization` header, so gating `live.` kills live position while not gating it leaves the perimeter partial. The gate is the app's own auth, plus `X-Robots-Tag: noindex, nofollow` and Cloudflare edge bot rules; Play's tester list already restricts the mobile side. An **invite code on registration** is the recorded escalation if open web registration stops being tolerable. `noindex` is for the beta only — `/explore` and public route pages are a real discovery channel and get un-blocked at open release |
| `get.kayaktrek.app` dropped — the row above did not survive one day | ADR-034 | 2026-08-31 | Two things moved out from under the row above between when it was written and now. **M21 (this same date) removed its stated reason to exist**: the row's own text says `get.` carries "what must survive the box being asleep" — that box was the home server, and M21 moved the app to an always-up droplet, so `kayaktrek.app/privacy` is now exactly as reachable independent-of-app-downtime as a separate domain would have been. **Implementation had also already diverged from the plan**: the privacy policy shipped *in the app* (`frontend/app/(public)/privacy`, this date) rather than on `get.`, which the row's own text says should not have been possible — nobody re-read the ADR when writing the page. Revisiting the scope surfaced the real problem: the row conflates two audiences that do not belong on one domain. Play-required boilerplate (privacy, terms, account-deletion, support contact) is for a data subject or a reviewer; a promotional pitch with screenshots or video — what was actually being asked for when this got re-opened — is for a recruiter or collaborator evaluating the *build*, a different audience than either the app's own kayaker-facing landing page or the compliance page serve. Komoot/AllTrails/Strava's model was checked and doesn't recommend a separate marketing domain either: in each, the product's own root domain is the pitch, which `kayaktrek.app`'s landing page already is. **Resolution:** no `get.kayaktrek.app`. Compliance content stays in the app, where it already lives and where the original "must survive downtime" requirement is now met by the app itself. A portfolio/case-study page, if built, is a separate deliverable for a separate audience — not a subdomain of the product, so it doesn't undersell either audience by sitting next to the other's content. Not decided here: where that case-study page would live, if wanted. The "public repo as the cheap half of opening up" idea loses its vehicle along with `get.`'s own repo — revisit under the still-undecided open-source-strategy question (`ROADMAP.md`) if still wanted, now against the app repo directly rather than a throwaway promo repo |
| **Open-sourcing examined and left undecided; the audit behind it stands** | ADR-034 | 2026-09-05 | Revisits the question the row above defers "against the app repo directly" and **does not settle it** — opening is explicitly not a gate on 1.0 (`plans/M25-web-1.0-release.md` non-goals). The argument for: 1.0 asks strangers to trust the app with route plans, crew contacts and live position, so auditability is a claim the source can back and nothing else can. Why it stays open: **the audience that would exercise it is not the audience being launched to** (kayakers arriving from a blog post do not read source), **trust is not the binding constraint** (`/explore` served one route on 2026-09-05 — a visitor judges the library, not the repository), and **closed → open is available any day while open → closed never is**, so deferring spends nothing irreversible at the point of least information. **The deferral's own stated premise was nevertheless false, and was never checked**: it holds that untracked planning material sits in the history so opening needs a fresh repo, but those paths return **zero commits** on any branch — gitignored throughout. *`git log --all -- <path>` is one command; do not claim what history contains without running it.* **Audit, durable whichever way this goes:** no plaintext secret was ever committed (every match is an `.example`, except `secrets/env.prod.sops` — 36 `ENC[AES256_GCM]` values, `age` key never in the repo, values since rotated); and licensing is unencumbered — a second human contributed 66 commits in 2022–23, but full-file blame attributes them **zero surviving lines** (92,101 + 39,047 to the operator, 2,763 to `noreply@anthropic.com`), so the work can be licensed unilaterally whenever the question is answered. Settled about *how*, in advance of the *whether*: **start at the stricter licence end** (relaxing later is unilateral and uncontroversial; tightening splits a community and invites a fork of the last permissive release), **AGPL-3.0** leading because it is OSI open source *and* its network copyleft deters commercial absorption without the project having to say so anywhere — source-available licences (BUSL, PolyForm, Elastic) are rejected because a project pitching auditability cannot afford the one README claim a developer audience would dispute on sight; and **the brand does what the licence should not** (code open, name and mark reserved — the actual Android arrangement, since AOSP is Apache-2.0 and what Google withholds is Play Services and the trademark). **Decided separately, and not contingent on any of this: the `noreply@anthropic.com` commit authorship is to be corrected.** The operator directed the work and holds the copyright; an `author` field naming an assistant claims more than the truth, and it entered the history through an agent acting against an already-stated preference rather than by any decision — so correcting it fixes the record rather than editing it. Scope: **22 commits** authored and committed by that address, plus **18** carrying `Co-Authored-By: Claude` trailers; the **21** dependabot trailers must survive. `filter-repo --mailmap` does both in one pass (a clone-and-rebase would mangle the real merge commits) and rewrites **617 of 1129** hashes, so it wants a moment with no open PRs and no live worktrees. **The source is still open** — a trailer was added on 2026-09-05 itself, so cleaning history without closing that just refills it |
| **`app.` reinstated, `www.` added — reversing the 2026-07-31 and 2026-08-31 rows, on a different argument than either evaluated** | ADR-034 | 2026-09-11 | Scoped as M28 (`plans/M28-marketing-subdomain.md`). The two prior no-separate-marketing-domain rows both evaluated **pitch quality**: would a dedicated promo site sell the product better than the app's own chart-hero landing does, and both times the answer was no (Komoot/AllTrails/Strava don't run one either; "the product's own root domain is the pitch"). This reverses on a question neither row asked: **whether an anonymous stranger will type a password into an unknown product at all**, before they've seen anything the app offers as proof. A map-and-invite screen is a good pitch to someone who already trusts the site enough to look; it reads as a possible credential-harvesting page to someone who doesn't, and `/explore` serving essentially no content (1 route as of 2026-09-05, M23/M25) makes that worse, not better. A static, obviously-hand-written company page — About, features copy, `support@kayaktrek.app` for bug reports, no login prompt, no other paddler's data — is a legitimacy signal, not a better version of the same pitch, so it isn't foreclosed by either prior row's reasoning. **Cost is low, verified rather than assumed**: cookies need no code change (`setAuthCookies` never sets an explicit `domain`, so they're already host-only and follow the app to `app.` automatically); `FRONTEND_URL` is already the single source every backend-emitted link and the frontend's `sitemap.ts`/`robots.ts` build from, so one env var carries the cutover; there is no CORS layer to update (`api.`/`live.` have been separate origins from the frontend since M8 already); and nginx already runs the multi-SAN/multi-vhost pattern this needs two more of. **What's different from `get.` (2026-08-30/31)**: `get.` bundled a promo pitch with Play compliance boilerplate for two different audiences on one subdomain and was dropped because compliance content already lives safely in the app; `www.` here carries only the promo/trust half, is genuinely static (no framework, no container, no build pipeline — plain HTML/CSS served directly by nginx), and the apex redirects to `app.` (path+query preserved), never to `www.`, so no already-shared float-plan/story/verify link breaks. GitHub/open-source link stays out of the marketing page — that question is still the 2026-09-05 row's, undecided |
| **`storage.<domain>` vhost actually retired — the 2026-08-26 row claimed it, the template never did it** | amends the 2026-08-26 R2-migration row | 2026-09-11 | The R2-migration row above says plainly "`storage.<domain>` vhost retired." It was not: `nginx/kayak-expedition-planner.conf.template` still carried the full MinIO `storage.` `server` block, its cert SAN, and its place in the six-hostname count three weeks later, found only because M28's own SAN-list edit (the row above) required touching the same file and looking at every entry in it. `docker-compose.prod.yml`'s own comments ("MinIO is no longer in this file") had already said as much for weeks with nobody cross-checking the vhost against it — the same "a claim in one file is not evidence for another" gap `CLAUDE.md`'s `INVITE_CODE` entry already names. Removed in the same pass as the M28 SAN-list change (cheap to fold in, since the cert command was already being edited): the vhost, its cert SAN, and its live entry in `DEPLOY.md`'s Status section. Nothing was serving on `storage.` in production regardless — R2 has held every object since 2026-08-26 — so this was a dead DNS record and an unused nginx block, not a live regression |
| **Open-sourcing decided — reverses the 2026-09-05 "undecided" row, on a different argument than it evaluated** | ADR-034 | 2026-09-12 | The 2026-09-05 row weighed opening *for* an audience already there to be reassured, and correctly found nobody was there yet to reassure (`/explore` at 1 route). This decides the opposite direction on a premise that row never considered: **open the repository specifically because there is no userbase yet, not despite it** — auditability plus a credible community-based-product story is the acquisition pitch used to build a userbase, not a response to one already asking. The audit and the "how" decisions in the 2026-09-05 row (AGPL-3.0, brand-not-licence, no fresh repo needed) are unchanged and now become the execution basis rather than a durable-if-unused answer. **Tied to the monetisation side of the same decision, recorded in `ROADMAP.md`'s Strategy section**: real hosting cost plus a near-finished product changed the calculus from "wait for a usage signal before building paid features" to "have paid features ready now" — the open core and the premium integration broker (`ROADMAP.md`'s open-core section) are now one launch move, not a self-hosted-trust-signal first and a monetisation-layer added later once self-hosters exist. BYOK and third-party platform integrations (Strava, satellite feed, notification-channel/chatbot) are the first features to gate through the broker, adopted early rather than deferred behind a self-hoster trigger that this decision no longer waits for |
| **Mobile *and* the new B2B/Pro admin console both stay closed source, consolidated into one `kayak-premium` repo; monorepo split is a prerequisite of executing the open-source decision, not its own milestone** | amends the row above | 2026-09-12 | Forced by scoping mobile GPS/Bluetooth integration (`docs/adr/mobile-offline.md` M9f): BLE-GATT/NMEA and satellite-feed (inReach MapShare etc.) integrations have no third-party secret to gate on the way Strava/BYOK do, so protecting them as premium requires the feature *code* itself to be absent from whatever repo goes public — the existing Core-BE-contains-all-the-logic principle doesn't extend to this feature. **Widened same day**: the B2B/Pro tier was reframed as its own frontend (an admin console for operators/organisers, distinct from the consumer app's information architecture — `ROADMAP.md`'s Strategy section), closed by a different but parallel logic (it's the paid product surface itself, not something the consumer-trust pitch needs open). Both land in the existing private **`kayak-premium`** repo alongside the Premium Broker BE — one closed home for Broker BE + mobile app + B2B console, not three separate private repos. The 2026-09-05 audit's "no fresh repository required, it's a visibility flip" conclusion assumed an all-or-nothing flip and no longer holds: git visibility is per-repository, so `backend/`+`frontend/` (public **`kayak-core`**) and everything closed (`kayak-premium`) need an actual repo split, not a flag flip. **Sequencing deliberately left unpinned to a date** for the split itself — nothing is blocked while the monorepo stays private — but the split (repo structure) and the console *build* are two different clocks: building the console is a large, later bet sized like M26, not like BYOK/Strava, so the repo split should exist before the console is built, not the other way round. **One concrete coupling to solve when the split happens**: M9b's `frontend/lib/*` reuse by mobile becomes a public npm package — private registries were considered and rejected, since `frontend/lib` is part of Core and public either way, so gating the package adds real ongoing operational cost for no confidentiality benefit. **Open question, not yet decided**: whether Club-admin features belong on the same B2B console once the missing `Club`/`Organization` schema exists |
| **Deploy availability — maintenance mode + per-service rolling replacement; blue/green rejected** | ADR-034 | 2026-09-20 | Scoped as `plans/M33-deploy-availability.md`; full reasoning in "Deploy availability" above. Triggered by M25's open registration putting real users on the app, not by a measured outage — the current downtime window has never been timed, and M33 WP0 gates the rest of the plan on measuring it. Blue/green rejected on three measured grounds: a parallel serving tier is 1792M against 2064M available (220M already swapped), so it fits only by eating the page cache Postgres works from; `sse` and `backend` already sit at 95.8% and 90.1% of their limits with no slack to borrow; and `beat` is a singleton scheduling the missed-checkpoint shore-contact email, so duplicating it sends a real shore contact duplicate safety alerts — a safety constraint that forces beat out of any parallel stack regardless of memory. Chosen path is cheap because nginx runs on the host, outside the compose lifecycle, and is therefore a switch point that survives container replacement; it has no `upstream` blocks today (`proxy_pass` hardcoded), so adding them is the enabling refactor. **Maintenance mode is the base layer, not the lesser option** — a schema-breaking migration requires old code to stop before the new schema lands, which no traffic-switching scheme changes, so it is both the first increment and the permanent fallback. The expensive prerequisite for rolling deploys (expand-only migrations) was found already met: the last 15 migrations' `upgrade()` paths are additive but for one `drop_constraint` — note the first pass of that audit read `downgrade()` bodies and overstated the problem, so audit `upgrade()` only. M33 WP4 promotes expand-only from habit to written rule since rolling replacement makes it load-bearing. Explicitly out of scope: a second droplet or load balancer (revisit under this ADR's redundancy-tier ladder), and the `sse`/`backend` memory pressure, which is real but its own problem |
| **`sse`/`backend` "memory pressure" was reclaimable kernel slab, not app memory — the 2026-09-20 figures are corrected** | ADR-034 (corrects the "Deploy availability" measurements) | 2026-10-03 | Measured on `kayak-do` from each container's cgroup `memory.stat`, both up 7 days: `sse` 482 MiB reported = `anon` 130 MB + `slab_reclaimable` 340 MB + file 7 MB; `backend` 744 MiB = `anon` 276 MB + slab 453 MB + file 13 MB. `oom_kill 0` in both, no restarts; `memory.events max` hit 225 (`sse`) / 6612 (`backend`) times, each resolved by reclaim; total memory-stall time over the 7 days ~3 s / ~19 s. So real headroom is ~75% / ~64%, not 4% / 10%. The previous row's "memory pressure, which is real" is withdrawn. **Probable slab source, not proven** (slabinfo needs root): the `python -c` healthcheck spawns a fresh interpreter every 10 s per container; in these images `python` is the venv's interpreter, so every start scans all of site-packages (a bare `python:3.12-slim`, with nearly empty site-packages, does not reproduce the growth). A full-startup launch measured ~15 KB of new slab against ~1.3 KB for `python -I -S`, but readings at the limit are noisy because reclaim runs mid-measurement. Healthchecks moved to `busybox wget` against `127.0.0.1` (gunicorn binds IPv4 only) in a separate change, PR #325: `busybox` is one package and ~0.9 MB on `python:3.12-slim`, against 22 packages / ~14 MB for `curl` and ~12 MB for Debian's `wget`. **Read memory from `memory.stat`'s `anon`, never from `docker stats`' percentage.** M33's blue/green rejection still holds on its beat-singleton argument; its memory argument is weaker than recorded and should be re-measured on this basis if blue/green is revisited. For M36, the binding SSE limits are the 200 `--worker-connections` cap and one Redis subscription per viewer, not memory (`plans/M36-multi-device-live-sync.md` risk 1) |
| **Trip change notifications ride the SSE sidecar as hints, never data (M36) — extends ADR-033** | ADR-033 | 2026-10-09 | **Transport superseded 2026-10-14 by the row below; the hint-not-data principle, the one commit hook and the trip-scoped registry stand.** `plans/M36-multi-device-live-sync.md`. ADR-033 named "trip-collab notifications over the same path" as its intended rider; this is that. **Events carry `{table, id, op}` and a per-trip revision, never field values**, so permissions stay in the normal read path and a dropped, duplicated or reordered event cannot corrupt anything: a client refetches through the endpoint it already uses. **One hook, not a call per service**: a SQLAlchemy `after_flush`/`after_commit` listener over a registry of trip-scoped models, publishing strictly after commit, coalesced to one message per trip, fail-open on a Redis outage; a model that is neither registered nor on the exclusion list fails CI, so an event cannot be silently forgotten. Channel `trip:<id>:changes` on the existing Redis db 3 (a second channel on the same db, not a fifth allocation); the revision is a Redis `INCR`, not a column, so there is no migration and no write contention on the trip row. The stream is `/api/v1/live/trip/<id>/changes`, crew-only, in **any** trip state (unlike the position stream, which ends when a trip stops `happening`), with a 5-minute ticket naming the user and a 60 s membership re-check so a removed member's open stream closes. **Capacity, measured on a real sidecar** (`plans/M36` "Capacity, measured"): ~40 KiB per held stream, so memory is not the constraint; two defects found and fixed (a 100-connection Redis pool exhausted by a reconnect storm, leaving the 100th stream open and silent; a fan-out reader killed by the shared connection closing under it). One Redis subscription per process fans out to bounded per-viewer queues, and a viewer that stops reading is cut loose to reconnect rather than buffered. **The binding ceiling is nginx**, not the sidecar — 768 `worker_connections` per worker, two per proxied stream — so `TRIP_CHANGES_MAX_STREAMS` defaults to 300 and answers `503` + `Retry-After` beyond it, after authorisation so capacity reveals nothing to a stranger. The route has its own `60 per minute` per-IP limit because production's inherited `10 per minute` would have locked a crew sharing one WiFi out of the feature. **Not decided here**: M8's position stream takes a pooled Redis connection per viewer and has the same ~100-viewer ceiling; the fix has the same shape but changes a safety-adjacent stream |
| **Trip changes are polled from a capped log, not streamed (M36) — supersedes the transport of the row above** | ADR-033 | 2026-10-14 | `plans/M36-multi-device-live-sync.md` "Revision (2026-10-14)". Running the stream end to end found what holding one connection per open trip page costs: a held connection and two nginx `worker_connections` each, a fan-out to keep Redis connections bounded, a capacity cap, a reconnect-storm path, a ticket per reconnect, and a window between render and connect in which a change is lost — all to deliver a *hint* that a visible tab needs within seconds. **Replaced by a per-trip log and a short request**: `trip:<id>:log` is a Redis sorted set scored by revision, numbered and appended in one Lua script (so entries are in revision order and a reader can never see 6 before 5), capped at 100 entries with a 1 h expiry; `GET /api/v1/live/trip/<id>/changes?since=<rev>` on the sidecar answers `{rev, changes, truncated}`, the common case being one Redis `GET`. Revisions are consecutive, so a log that was trimmed, expired, flushed or too large to send is detectable without extra state and is answered `truncated`, which every client treats as "refresh everything". **Clients poll every 7 s (web) / 10 s (mobile), only while the tab or app is in front**, and catch up on returning; pages start from `changeRev`, read *before* the data, which closes the render-to-connect gap. One shared poller (`frontend/lib/live/trip-changes-poller.ts`, imported by mobile as `@shared`) owns the protocol so the two clients cannot drift. Web skips changes the current page cannot show (`lib/trips/change-relevance.ts`; unknown pages, tables and extents always refresh — a stale page is a bug, an extra render a cost). **The rate limit is per user, not per IP**, because the droplet's nginx appends `$remote_addr` to `X-Forwarded-For` and never restores the visitor's address from Cloudflare, so an address key may be one key for everyone; membership is checked from a 30 s in-process cache (a refusal is never cached). **Measured** (`scripts/poll-capacity/`, one gevent worker as in production, a fresh connection per poll as nginx makes): 2000 viewers polling every 7 s is 287 req/s at p99 12 ms, 0 errors, 45% of a core, RSS flat at 167 MiB — so the sidecar is nowhere near a ceiling at any plausible number of viewers (the harness stubs the database membership check, which the cache keeps to about 30 queries a second per thousand viewers). nginx now carries short requests instead of held connections, which is what removes its `worker_connections` ceiling from the picture, though that was not itself measured. `TRIP_CHANGES_MAX_STREAMS` and the 600-connection worker setting are gone. **M8's position stream moves onto the same `PubSubFanout`** (one Redis connection per process however many watch), closing the ~100-viewer ceiling the row above left open: a story link read by a crowd can no longer exhaust `live_redis()`'s pool. **Push notifications were considered and dropped**: web push (service worker, VAPID, subscription storage) and mobile push (FCM, device tokens, a Play Data-safety entry) cost far more than the few seconds they would save for people already looking at the page. **A page refreshes at most once per 30 s** however often the poll finds a change: a refresh re-runs the layout's reads, each backend route allows 200 calls an hour per user, and a refresh per 7 s poll would have spent that budget in under half an hour of someone else editing. Measured at +14% layout calls with the listener on, in a short e2e run — a bound, not a typical cost. |
| **Typed contract: the spec's per-route detail becomes a gate; the frontend DTOs stay hand-written Zod** | ADR-031 (amends the M13 Part B row's "progressive follow-up") | 2026-10-16 | `plans/M37-discipline-pass.md` WP5. **What the spec already derives from code**: paths, methods and the auth requirement come from the route table, and every Marshmallow schema becomes a component by a module walk, so neither can drift. **What is still hand-written** is each route's request and response detail, the YAML docstring; the M13 Part B row left that as "progressive follow-up, not blocking". Measured 2026-10-16: 158 of 212 routes (75%) have it, and the other 54 are in the spec with the right path, method and auth but no body or response schema. **Decided: that follow-up becomes a gate** — write the missing 54, then add a test that fails when a route has none, in the shape of the layering ratchet. **The frontend DTOs stay hand-written, and generating them is not adopted yet**, for three measured reasons. (1) A DTO file holds two kinds of schema. Response schemas mirror the wire and apply no `transform`, `coerce` or `preprocess` anywhere in `lib/dtos`; form schemas carry what the frontend adds (user-facing messages, `refine(noHtmlTags)`, password confirmation, a different shape). Only the first is duplication a generator could remove. (2) A generated contract carries only what the spec carries: `Schemas/` holds 88 `@validates` methods, which apispec cannot read, against 42 declarative `validate=` arguments, so a rule such as `Log.hours` being 0 to 24 would not reach a generated Zod schema. (3) Generation inherits the 25% gap, and mobile imports `@shared/dtos` in 89 files, so generated output needs a home that fits the open-source split (the "Open source" section) before it exists. **Follow-ups, in this order, none scheduled** (building any is its own milestone): the coverage gate; a drift check comparing each response DTO's fields and nullability with its OpenAPI component, with no code generation; then a spike generating response schemas only, with form schemas composing them by hand — no generator has been evaluated against this repo yet. **Not adopted**: declaring operations with decorators (flask-smorest, apiflask), which would generate the operations but means migrating all 212 routes through the resource layer; reconsider only if the docstrings keep drifting after the gate. |
