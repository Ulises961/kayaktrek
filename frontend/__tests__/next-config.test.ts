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

  it("allows geolocation for our own origin (M8 Navigate mode) but denies camera and microphone", async () => {
    const headers = await headerMap()

    expect(headers["Permissions-Policy"]).toContain("geolocation=(self)")
    expect(headers["Permissions-Policy"]).toContain("camera=()")
    expect(headers["Permissions-Policy"]).toContain("microphone=()")
  })

  // CSP itself moved to proxy.ts (needs a fresh per-request nonce, which this static
  // config can't provide) — see __tests__/proxy.test.ts's buildCsp coverage.

  it("only sends Strict-Transport-Security in production", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const prodHeaders = await headerMap()
    expect(prodHeaders["Strict-Transport-Security"]).toContain("max-age=")

    vi.stubEnv("NODE_ENV", "test")
    const devHeaders = await headerMap()
    expect(devHeaders["Strict-Transport-Security"]).toBeUndefined()
  })
})
