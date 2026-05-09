# ADR-003: UUID v7 as primary keys on all entities

**Status**: accepted
**Date**: 2025-01-01

## Context

Primary key choice affects:
- **Security**: sequential integer IDs expose record counts and allow enumeration
- **Distribution**: UUIDs are safe to generate client-side or across multiple nodes
- **Index performance**: random UUIDs (v4) cause B-tree index fragmentation; sequential integers are optimal but enumerable

## Decision

Use **UUID v7** on all entity primary keys.

UUID v7 is time-ordered (millisecond precision in the most-significant bits), which gives B-tree index locality close to sequential integers while retaining the uniqueness and non-enumerability of UUIDs. Generated server-side by the `uuid7` Python library.

## Consequences

**Positive**
- Non-enumerable: clients cannot guess adjacent record IDs
- Time-ordered: index insertion is efficient, no fragmentation
- Safe for future multi-node or mobile-generated IDs (M9)
- IDs embed a timestamp — useful for debugging without a separate `created_at` in some cases

**Negative / trade-offs**
- Slightly larger storage than integers (16 bytes vs 4–8 bytes) — negligible at this scale
- UUID v7 is an RFC draft (finalized RFC 9562 in 2024) — library support is now good but was early when adopted

**Risks / open questions**
- Mobile sync (M9): if the mobile client generates UUIDs offline, ensure the `uuid7` library is available in the React Native environment, or generate at sync time on the server
