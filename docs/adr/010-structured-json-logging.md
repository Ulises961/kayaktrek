# ADR-010: Structured JSON logging to stdout

**Status**: accepted — extended by [ADR-009](009-observability-logfire.md) when OTel lands
**Date**: 2025-10-01

## Context

The backend needs a logging strategy that is:
- Machine-readable for log aggregation (Loki, Datadog, CloudWatch, etc.) without per-destination format config
- Searchable by request, task, user, and arbitrary business fields without log parsing
- Vendor-agnostic: the choice of log aggregator should not require code changes

The simplest production-friendly pattern is **JSON to stdout** — the container runtime captures stdout and forwards it to whatever aggregator is in use. No log files, no rotation, no shipping agent in the app process.

Flask's default logging writes human-readable strings with no structure — useless for programmatic querying.

## Decision

All backend log output is **structured JSON on stdout**, implemented via a custom `JsonFormatter` in `Services/Utils/logging_utils.py`.

Key design choices:

- Log events use **machine-readable key names, not sentences**: `logger.info("trip_created", extra={"trip_id": ..., "user_id": ...})`. This makes logs filterable without regex.
- A `RequestContextFilter` injects `g.request_id` (from `X-Request-ID` header or a fresh UUID per request) into every log record automatically.
- `JsonFormatter` captures all fields passed via `extra={}` kwargs so arbitrary context can be attached at the call site.
- SQLAlchemy loggers default to `WARNING`; set `SQL_ECHO=true` in `.env` to enable query-level `DEBUG` output locally.

## Relationship to OTel / Logfire (ADR-009)

Structured logging and distributed tracing are **complementary, not competing**:

| Concern | Owned by |
|---------|----------|
| Business events, audit trail, error context | `JsonFormatter` → stdout → log aggregator |
| Request timing, span tree, service-to-service correlation | OTel / Logfire |

When [ADR-009](009-observability-logfire.md) is implemented:
- The `JsonFormatter` **stays** — it is the vendor-agnostic log output layer
- OTel injects `trace_id` / `span_id` into the logging context; these fields should be added to the formatter output so individual log lines can be correlated to their trace in Logfire
- The manual `g.request_id` propagation becomes redundant for cross-service correlation (OTel handles that automatically), but can remain as a lightweight per-request identifier in logs until OTel is fully verified end-to-end

The stdout-JSON approach is also the natural fallback if Logfire pricing becomes untenable: re-point the OTel exporter to a self-hosted Collector, and the stdout logs continue feeding Loki or equivalent independently — no code changes required.

## Consequences

**Positive**
- Any log aggregator that accepts JSON lines works without format changes
- `request_id` appears on every log line from a given HTTP request
- `extra={}` is open-ended — callers attach whatever context is relevant
- Vendor-agnostic: the same stdout stream feeds any aggregator

**Negative / trade-offs**
- Human readability in development is worse than plain text — use `docker compose logs | jq .` locally
- No span tree or timing breakdown within a request — that gap is addressed by ADR-009
- Flask→Celery propagation is manual: callers must pass `request_id=g.request_id` when dispatching tasks

**Risks / open questions**
- When OTel lands, add `trace_id` and `span_id` fields to the formatter so logs and traces are correlatable in the aggregator
