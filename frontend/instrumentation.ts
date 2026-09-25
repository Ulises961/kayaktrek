import type { Instrumentation } from "next"
import { API_URL, SSE_URL } from "@/lib/api/config"

// M13 §A.3 — server-side distributed tracing (ADR-009). Mirrors the backend's
// Api/observability.py: unset LOGFIRE_TOKEN is a clean no-op (no exporter registered,
// no network calls). Browser-side RUM is explicitly out of scope
// (plans/M13-observability-logfire.md A.3) — no client bundle weight added for it.
//
// "Unset" is a claim about the environment, not a guarantee this file makes. A developer
// with LOGFIRE_TOKEN exported in their shell profile has it inherited by anything they
// launch, which is how the backend ended up shipping spans from local test runs. The
// server-side equivalent here is the e2e suite's `next start`; that is closed in
// e2e/run-live-stack.sh, which exports the token empty before building. Vitest never
// calls register(), so unit tests were never a path.
//
// Dynamic imports keep the Node-only OTel exporter out of the edge runtime bundle —
// `register()` also runs under `NEXT_RUNTIME=edge` (proxy.ts), which can't load it.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }

  const token = process.env.LOGFIRE_TOKEN
  if (!token) {
    return
  }

  const { registerOTel } = await import("@vercel/otel")
  const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http")
  const { resolveBaseUrl } = await import("logfire")

  const environment = process.env.LOGFIRE_ENVIRONMENT || process.env.NODE_ENV || "development"
  // The write token embeds its region (`pylf_v<version>_<region>_...`) — resolveBaseUrl parses
  // it, so this lands on the same logfire-{eu,us}.pydantic.dev host the backend's Python SDK
  // auto-detects, without a second region setting to keep in sync.
  const baseUrl = resolveBaseUrl(process.env, undefined, token)

  registerOTel({
    serviceName: "kayak-frontend",
    attributes: { "deployment.environment.name": environment },
    traceExporter: new OTLPTraceExporter({
      url: `${baseUrl}/v1/traces`,
      headers: { Authorization: token },
    }),
    // @vercel/otel only propagates W3C trace context to Vercel's own deployment URLs by
    // default — every other origin, including our self-hosted backend, is silently excluded
    // unless listed here. Without this, apiFetch's calls create their own disconnected traces
    // instead of continuing the frontend's.
    instrumentationConfig: {
      fetch: { propagateContextUrls: [API_URL, SSE_URL] },
    },
  })
}

// A server-render exception never reaches Logfire on its own: the backend answered 200 to
// every call the page made, and the throw happens afterwards in Next (a Zod parse of a
// response, say), so the only trace is a line on the container's stdout. Production shows
// the visitor just a digest ("Reference: 3967558296"), and this span is what ties that
// digest to the actual error.
//
// The route *template* is recorded, never `request.path`: share links carry their token in
// the path (`/float-plan/[token]`, `/story/[token]`).
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.LOGFIRE_TOKEN) {
    return
  }

  const { trace, SpanStatusCode } = await import("@opentelemetry/api")
  const span = trace.getTracer("kayak-frontend").startSpan(`render error ${context.routePath}`)
  const digest = (error as { digest?: string } | null)?.digest
  span.setAttributes({
    "http.route": context.routePath,
    "http.request.method": request.method,
    "next.router_kind": context.routerKind,
    "next.route_type": context.routeType,
    "next.render_source": context.renderSource,
    ...(digest ? { "next.digest": digest } : {}),
  })
  span.recordException(error as Error)
  span.setStatus({ code: SpanStatusCode.ERROR })
  span.end()
}
