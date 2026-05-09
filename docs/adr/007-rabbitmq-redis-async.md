# ADR-007: RabbitMQ for offline sync, Redis for real-time pub/sub, Celery for async tasks

**Status**: accepted
**Date**: 2025-01-01

## Context

Three distinct async/messaging needs exist in the system:

1. **Offline sync (mobile)**: a paddler at sea loses connectivity. Mutations made on the mobile client must be durably queued and replayed when connectivity is restored — potentially hours or days later.
2. **Live position broadcast**: during an active expedition, a paddler's position is shared with followers in near-real-time. This data is ephemeral — if a message is lost, the next position update supersedes it.
3. **Background tasks**: fetching weather data from OpenMeteo, sending emails, processing GDPR exports — tasks that should not block an HTTP request.

## Decision

- **RabbitMQ**: durable message broker for mobile offline sync (M9). Survives broker restarts; queued mutations are not lost. AMQP protocol.
- **Redis**: pub/sub for live position broadcasting (M8). Ephemeral by design — no persistence needed, very low latency. Redis DB allocation is fixed to prevent cross-contamination between its three uses:

  | DB | Purpose |
  |----|---------|
  | 0 | `flask-limiter` rate limit counters |
  | 1 | `Flask-Caching` application cache (OpenMeteo responses, item categories, POI queries — wired at M5) |
  | 2 | Celery result backend |

- **Celery**: task queue for background work, brokered by RabbitMQ. Handles weather fetches, email delivery, GDPR export generation.

## Consequences

**Positive**
- RabbitMQ durability guarantees offline mutations survive network loss — critical for a maritime app
- Redis pub/sub is the right primitive for ephemeral position data; no disk I/O, sub-millisecond fan-out
- Celery integrates well with Flask and supports periodic beat tasks (weather refresh schedule)
- Separation of concerns: durable vs ephemeral messaging is explicit in the architecture

**Negative / trade-offs**
- Three infrastructure components (Postgres, RabbitMQ, Redis) in addition to the app itself — compose stack is heavier
- Celery + RabbitMQ share the broker but serve different purposes; operations teams must understand both use cases
- Redis serves three distinct purposes on fixed DB indices — adding a fourth use requires a conscious allocation decision, not a default

**Risks / open questions**
- **Mobile sync protocol (M9)**: what gets queued (full entity snapshots vs diffs), conflict resolution strategy, and the denormalised mobile schema are all undesigned. This is the most architecturally complex milestone — design the sync contract before starting M9, not during it.
- RabbitMQ clustering and HA are not configured for production — single-node is acceptable for solo early users but must be addressed before scaling
