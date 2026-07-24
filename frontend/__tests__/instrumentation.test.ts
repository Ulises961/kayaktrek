import { describe, it, expect, afterEach, vi } from "vitest"

const registerOTel = vi.fn()
const OTLPTraceExporter = vi.fn()

vi.mock("@vercel/otel", () => ({ registerOTel }))
vi.mock("@opentelemetry/exporter-trace-otlp-http", () => ({ OTLPTraceExporter }))

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
