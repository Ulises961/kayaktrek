import { describe, it, expect, afterEach, vi } from "vitest"

const registerOTel = vi.fn()
const OTLPTraceExporter = vi.fn()

vi.mock("@vercel/otel", () => ({ registerOTel }))
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({ OTLPTraceExporter }))

const span = { recordException: vi.fn(), setAttributes: vi.fn(), setStatus: vi.fn(), end: vi.fn() }
const startSpan = vi.fn(() => span)
vi.mock("@opentelemetry/api", () => ({
  trace: { getTracer: () => ({ startSpan }) },
  SpanStatusCode: { ERROR: 2 },
}))

describe("instrumentation onRequestError", () => {
  const request = { path: "/float-plan/secret-token?x=1", method: "GET", headers: {} }
  const context = {
    routerKind: "App Router" as const,
    routePath: "/float-plan/[token]",
    routeType: "render" as const,
    renderSource: "react-server-components" as const,
    revalidateReason: undefined,
    renderType: "dynamic" as const,
  }

  afterEach(() => {
    vi.unstubAllEnvs()
    startSpan.mockClear()
    Object.values(span).forEach((fn) => fn.mockClear())
  })

  it("records the error on a span carrying the digest that the error page shows the user", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "pylf_v1_eu_test123")
    const { onRequestError } = await import("../instrumentation")
    const error = Object.assign(new Error("ZodError: waveHeight"), { digest: "3967558296" })

    await onRequestError(error, request, context)

    expect(startSpan).toHaveBeenCalledWith("render error /float-plan/[token]")
    expect(span.recordException).toHaveBeenCalledWith(error)
    expect(span.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: 2 }))
    expect(span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "next.digest": "3967558296",
        "http.route": "/float-plan/[token]",
        "http.request.method": "GET",
      }),
    )
    expect(span.end).toHaveBeenCalledTimes(1)
  })

  it("never records the raw request path, which can carry a share-link token", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "pylf_v1_eu_test123")
    const { onRequestError } = await import("../instrumentation")

    await onRequestError(new Error("boom"), request, context)

    expect(JSON.stringify(span.setAttributes.mock.calls)).not.toContain("secret-token")
    expect(JSON.stringify(startSpan.mock.calls)).not.toContain("secret-token")
  })

  it("still ends the span for an error that is not an Error instance", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "pylf_v1_eu_test123")
    const { onRequestError } = await import("../instrumentation")

    await onRequestError("a string was thrown", request, context)

    expect(span.recordException).toHaveBeenCalledWith("a string was thrown")
    expect(span.end).toHaveBeenCalledTimes(1)
  })

  it("does nothing when tracing is not configured", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "")
    const { onRequestError } = await import("../instrumentation")

    await onRequestError(new Error("boom"), request, context)

    expect(startSpan).not.toHaveBeenCalled()
  })
})

describe("instrumentation register", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    registerOTel.mockClear()
    OTLPTraceExporter.mockClear()
  })

  it("no-ops outside the nodejs runtime, even with a token set", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge")
    vi.stubEnv("LOGFIRE_TOKEN", "test-token")
    const { register } = await import("../instrumentation")

    await register()

    expect(registerOTel).not.toHaveBeenCalled()
  })

  it("no-ops when LOGFIRE_TOKEN is unset", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "")
    const { register } = await import("../instrumentation")

    await register()

    expect(registerOTel).not.toHaveBeenCalled()
  })

  it("registers a Logfire-pointed OTLP exporter with the service name and token when configured", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "pylf_v1_eu_test123")
    vi.stubEnv("LOGFIRE_ENVIRONMENT", "staging")
    const { register } = await import("../instrumentation")

    await register()

    expect(OTLPTraceExporter).toHaveBeenCalledWith({
      url: "https://logfire-eu.pydantic.dev/v1/traces",
      headers: { Authorization: "pylf_v1_eu_test123" },
    })
    expect(registerOTel).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: "kayak-frontend",
        attributes: { "deployment.environment.name": "staging" },
      }),
    )
  })

  it("propagates trace context to the backend and SSE origins", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "pylf_v1_eu_test123")
    const { register } = await import("../instrumentation")
    const { API_URL, SSE_URL } = await import("../lib/api/config")

    await register()

    expect(registerOTel).toHaveBeenCalledWith(
      expect.objectContaining({
        instrumentationConfig: { fetch: { propagateContextUrls: [API_URL, SSE_URL] } },
      }),
    )
  })

  it("resolves the US region for a us-region token", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "pylf_v1_us_test123")
    const { register } = await import("../instrumentation")

    await register()

    expect(OTLPTraceExporter).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://logfire-us.pydantic.dev/v1/traces" }),
    )
  })

  it("falls back to NODE_ENV for the environment attribute when LOGFIRE_ENVIRONMENT is unset", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs")
    vi.stubEnv("LOGFIRE_TOKEN", "pylf_v1_eu_test123")
    vi.stubEnv("LOGFIRE_ENVIRONMENT", "")
    vi.stubEnv("NODE_ENV", "test")
    const { register } = await import("../instrumentation")

    await register()

    expect(registerOTel).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: { "deployment.environment.name": "test" },
      }),
    )
  })
})
