# ADR-009: Logfire for observability (replacing manual OTel plan)

**Status**: proposed
**Date**: 2026-05-09

## Context

The current observability setup is:
- JSON structured logging via a custom `JsonFormatter` (stdout, Loki-friendly)
- Manual `g.request_id` propagation from `X-Request-ID` header
- No distributed tracing, no span tree, no frontend→backend correlation
- No Celery task tracing beyond manual `request_id` parameter passing

The original plan (documented in CLAUDE.md) was to wire OpenTelemetry manually: `opentelemetry-instrumentation-flask/sqlalchemy/celery`, export to an OTel Collector, and visualise in Grafana Tempo + Loki. This requires running and maintaining three additional infrastructure components (Collector, Tempo, Loki) before getting any value.

**Logfire** (by Pydantic) is a managed observability backend built on OpenTelemetry. It provides automatic instrumentation for Flask, SQLAlchemy, Celery, HTTPX, and others with minimal configuration, and ships its own dashboard without a self-hosted stack.

## Decision

Use **Logfire** instead of self-hosted OTel + Grafana stack. Instrument the Flask backend and Celery workers. Evaluate frontend instrumentation (Next.js / browser) in the same pass.

The existing `JsonFormatter` (ADR-010) is **not replaced** — it remains as the vendor-agnostic structured log layer (stdout → any aggregator). Logfire adds the distributed tracing layer on top. The manual `g.request_id` propagation becomes redundant for cross-service correlation once OTel context propagation is verified; the `JsonFormatter` should be extended to emit `trace_id` / `span_id` from the active OTel span so logs and traces are correlatable.

## Consequences

**Positive**
- Automatic instrumentation covers Flask requests, SQLAlchemy queries, and Celery tasks — no manual span creation for the common case
- Managed backend: no Collector, Tempo, or Loki to operate
- OTel-native: data can be exported to a self-hosted stack later if vendor lock-in becomes a concern
- Much lower time-to-value than the DIY OTel approach

**Negative / trade-offs**
- Vendor dependency: Logfire is a paid SaaS product (free tier available); moving to self-hosted later requires re-pointing the exporter, not a code rewrite
- Data leaves the local environment — not suitable if the expedition data is considered sensitive at rest (likely acceptable: only telemetry/traces, not payload data)

**Risks / open questions**
- Evaluate free tier limits before committing — trace volume from a small user base should be well within limits initially
- Confirm Logfire's Next.js / browser SDK exists and covers the frontend before scoping the milestone
- Add `trace_id` / `span_id` fields to `JsonFormatter` when Logfire is wired, so log lines and Logfire traces can be correlated in any aggregator
- The manual `g.request_id` can be retired once OTel context propagation is verified end-to-end; the `JsonFormatter` itself stays
- If Logfire pricing ever becomes untenable, re-point the OTel exporter to a self-hosted Collector — the stdout JSON logs (ADR-010) continue working independently without code changes
