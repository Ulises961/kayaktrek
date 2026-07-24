import { API_URL, SSE_URL } from "@/lib/api/config"

// M13 §A.3 — server-side distributed tracing (ADR-009). Mirrors the backend's
// Api/observability.py: unset LOGFIRE_TOKEN is a clean no-op (no exporter registered,
// no network calls), so this is safe in CI/tests/dev machines that haven't configured
// one. Browser-side RUM is explicitly out of scope (plans/M13-observability-logfire.md
// A.3) — no client bundle weight added for it.
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
