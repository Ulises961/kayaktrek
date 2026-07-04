import { describe, it, expect, afterEach, vi } from "vitest"
import nextConfig from "../next.config"

async function headerMap(): Promise<Record<string, string>> {
  const rules = await nextConfig.headers!()
  const rule = rules.find((r) => r.source === "/(.*)")!
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]))
}

describe("next.config headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("sets the baseline security headers on every route", async () => {
    const headers = await headerMap()

    expect(headers["X-Content-Type-Options"]).toBe("nosniff")
    expect(headers["X-Frame-Options"]).toBe("DENY")
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin")
  })

  it("denies geolocation, camera, and microphone via Permissions-Policy", async () => {
    const headers = await headerMap()

    expect(headers["Permissions-Policy"]).toContain("geolocation=()")
    expect(headers["Permissions-Policy"]).toContain("camera=()")
    expect(headers["Permissions-Policy"]).toContain("microphone=()")
  })

  it("ships a report-only CSP that denies framing and restricts default-src to self", async () => {
    const headers = await headerMap()
    const csp = headers["Content-Security-Policy-Report-Only"]

    expect(csp).toBeDefined()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  it("allows https image sources for map tiles and object storage, plus local MinIO in dev", async () => {
    const headers = await headerMap()
    const csp = headers["Content-Security-Policy-Report-Only"]

    expect(csp).toMatch(/img-src[^;]*https:/)
    expect(csp).toMatch(/img-src[^;]*http:\/\/localhost:9000/)
  })

  it("only sends Strict-Transport-Security in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const prodHeaders = await headerMap()
    expect(prodHeaders["Strict-Transport-Security"]).toContain("max-age=")

    vi.stubEnv("NODE_ENV", "test")
    const devHeaders = await headerMap()
    expect(devHeaders["Strict-Transport-Security"]).toBeUndefined()
  })
})
