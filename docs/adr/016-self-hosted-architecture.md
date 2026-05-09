# ADR-016: Self-hosted architecture — own the stack

**Status**: accepted
**Date**: 2026-05-09

## Context

The application stack includes components that each have managed cloud equivalents: PostgreSQL (RDS, Supabase), Redis (ElastiCache, Upstash), RabbitMQ (Amazon MQ, CloudAMQP), object storage (S3), and observability (Datadog, New Relic). At various points during development, managed alternatives were evaluated as ways to reduce operational burden.

The decision is whether to build on managed services — accepting vendor dependency and recurring cost per service — or to own the full stack on a self-managed server.

## Decision

**Own the full stack.** All infrastructure components run on self-managed servers under full operator control. No component is outsourced to a managed cloud service as a primary dependency.

The single exception is **Logfire** (ADR-009), which is a managed observability backend. This is accepted because: observability data is telemetry, not user data; the OTel exporter can be re-pointed to a self-hosted Collector without code changes; and the operational cost of running Grafana Tempo + Loki exceeds the value at this stage.

This means:
- PostgreSQL + PostGIS: self-hosted
- Redis: self-hosted
- RabbitMQ: self-hosted
- MinIO: self-hosted (S3-compatible; `StorageService` abstraction means the backend is agnostic on the implementation — AWS S3 is a drop-in if ever needed)
- SMTP: own domain, own mail server or transactional provider with no data lock-in
- Deployment: own VPS / dedicated server; Docker Compose in production initially, Kubernetes if scale demands it

## Update management

Container updates are split by type — application and infrastructure have different risk profiles and require different update mechanisms.

**Application containers** (backend, frontend, Celery worker) are updated via the CI/CD pipeline only:

```
git push / merge to main
  → GitHub Actions builds image, pushes to registry (GHCR or Docker Hub)
  → SSH into server: docker compose pull && docker compose up -d
```

No cronjob or automation should deploy application code without going through the pipeline. A human or a deliberate pipeline step must be in the loop.

**Infrastructure containers** (Postgres, Redis, RabbitMQ, MinIO) use **Watchtower in notify-only mode** — it watches running containers, detects newer image versions, and sends a notification. The operator then decides when to apply:

- Minor / patch versions (e.g. `redis:7.2.3 → 7.2.4`): safe to apply in a scheduled maintenance window with a tested rollback plan.
- Major versions: require a migration plan and manual execution. Never automated.

Watchtower must never be configured to auto-apply updates to infrastructure containers in production.

## Redundancy

A single server cannot provide true redundancy — the host itself is a single point of failure. Redundancy is built in layers, applied in order of value as the user base grows:

**Layer 1 — Process resilience (implement now)**
All containers run with `restart: unless-stopped`. Docker recovers from process crashes automatically without manual intervention. This handles the most common failure mode at zero cost.

**Layer 2 — Offsite backups (required before production launch)**
Daily automated backups shipped to offsite object storage (Backblaze B2 or equivalent — not the same provider as the server):
- Postgres: `pg_dump` compressed and encrypted
- MinIO: bucket sync to offsite storage (avatars, GDPR exports)
- RabbitMQ: configuration export (queued messages are ephemeral by design for most use cases)

Recovery time objective (RTO) at this layer: spin up a new server and restore — measured in hours. Acceptable for early stage. Backup integrity must be tested periodically; an untested backup is not a backup.

**Layer 3 — Warm standby (when first paying users exist)**
A second server running the same compose stack, kept current via replicated backups. Failover is manual — promote the standby, update DNS — but RTO drops to under an hour. Redis and RabbitMQ state is expendable (ephemeral by design); only Postgres and MinIO data requires replication.

**Layer 4 — Postgres streaming replication (when downtime has a measurable cost)**
A Postgres replica on the standby server receiving WAL from the primary. Data loss on primary failure is near-zero; failover is still manual but the replica is immediately promotable. This is the highest-value single redundancy investment because the database is the only truly stateful and irreplaceable component — all other services can be restarted from scratch.

The natural progression: **Layer 1 now → Layer 2 before launch → Layer 3 at first paying users → Layer 4 when churn from downtime becomes a real business cost.**

## Consequences

**Positive**
- No per-service vendor lock-in — switching providers requires a config change, not a rewrite
- Full control over data residency, retention, and access — relevant for GDPR and future maritime data licensing (ROADMAP)
- Cost is predictable: one VPS bill, not a sum of per-unit metered services that grows non-linearly with usage
- The `StorageService` abstraction and OTel exporter pattern mean the escape hatches are already built in — self-hosted is the default, managed is always an option

**Negative / trade-offs**
- Operational burden falls entirely on the solo developer: backups, upgrades, SSL renewal, monitoring, incident response
- No managed HA or automatic failover — single-node failures require manual intervention until the user base justifies a multi-node setup
- Security patching of OS and all services is manual

**Risks / open questions**
- **Backups**: automated daily backups of Postgres, MinIO, and RabbitMQ must be configured before production launch. This is the highest-risk operational gap.
- **SSL**: use Let's Encrypt + automatic renewal (Caddy or Certbot). Do not manage certificates manually.
- **Scaling inflection**: self-hosted on a single server is appropriate up to a meaningful user base. The point at which managed services or a multi-node setup becomes justified should be revisited when there are paying users, not before.
- **Mail**: using Gmail App Password for SMTP is acceptable in development. Before production, move to a dedicated sending domain with SPF/DKIM/DMARC records to avoid deliverability issues.
