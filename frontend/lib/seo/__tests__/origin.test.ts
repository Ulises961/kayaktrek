import { afterEach, describe, it, expect, vi } from "vitest"
import { siteOrigin, siteUrl } from "@/lib/seo/origin"

afterEach(() => vi.unstubAllEnvs())

describe("siteUrl", () => {
  it("follows FRONTEND_URL as it is at call time, not as it was at import", () => {
    vi.stubEnv("FRONTEND_URL", "https://app.example.com")
    expect(siteUrl("/sitemap.xml")).toBe("https://app.example.com/sitemap.xml")

    vi.stubEnv("FRONTEND_URL", "https://other.example.com/")
    expect(siteUrl("/sitemap.xml")).toBe("https://other.example.com/sitemap.xml")
  })

  it("falls back to the local dev origin when FRONTEND_URL is unset", () => {
    vi.stubEnv("FRONTEND_URL", undefined)
    expect(siteUrl("/")).toBe("http://localhost:3000/")
  })

  it("rejects a value with no scheme instead of emitting a relative URL", () => {
    vi.stubEnv("FRONTEND_URL", "app.example.com")
    expect(() => siteUrl("/")).toThrow(/FRONTEND_URL must start with http/)
  })

  it("rejects an empty value", () => {
    vi.stubEnv("FRONTEND_URL", "")
    expect(() => siteUrl("/")).toThrow(/FRONTEND_URL/)
  })
})

describe("siteOrigin", () => {
  it("resolves metadataBase against the configured origin", () => {
    vi.stubEnv("FRONTEND_URL", "https://app.example.com")
    expect(siteOrigin().href).toBe("https://app.example.com/")
  })

  it("throws a named error, not an opaque Invalid URL, for a bare host", () => {
    vi.stubEnv("FRONTEND_URL", "app.example.com")
    expect(() => siteOrigin()).toThrow(/FRONTEND_URL must start with http/)
  })
})
