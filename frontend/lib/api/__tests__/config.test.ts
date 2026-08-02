import { describe, it, expect, vi, afterEach } from "vitest"

// `config.ts` resolves its origins at module scope, so each case needs a fresh module
// registry rather than a re-import of the already-evaluated module.
async function loadConfig() {
  vi.resetModules()
  return import("../config")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("API_URL / SSE_URL resolution", () => {
  it("uses the configured origins when they are set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com")
    vi.stubEnv("NEXT_PUBLIC_SSE_URL", "https://live.example.com")

    const { API_URL, SSE_URL } = await loadConfig()

    expect(API_URL).toBe("https://api.example.com")
    expect(SSE_URL).toBe("https://live.example.com")
  })

  it("falls back to the local dev ports when unset outside production", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined)
    vi.stubEnv("NEXT_PUBLIC_SSE_URL", undefined)

    const { API_URL, SSE_URL } = await loadConfig()

    expect(API_URL).toBe("http://localhost:5000")
    expect(SSE_URL).toBe("http://localhost:5001")
  })

  // An unset repo Variable reaches the build as an empty string, not as undefined
  // (`frontend-ci.yml` passes `${{ vars.* }}` through to a Dockerfile `ARG`), so empty
  // has to resolve the same way missing does. An empty base would otherwise make every
  // request a same-origin relative URL aimed back at the Next.js server.
  it("treats an empty value as unset rather than as a same-origin base URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SSE_URL", "")

    const { API_URL, SSE_URL } = await loadConfig()

    expect(API_URL).toBe("http://localhost:5000")
    expect(SSE_URL).toBe("http://localhost:5001")
  })

  it("throws in production rather than shipping a localhost base URL", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_API_URL", "")

    await expect(loadConfig()).rejects.toThrow(/NEXT_PUBLIC_API_URL/)
  })

  it("names the SSE variable specifically when that is the missing one", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.com")
    vi.stubEnv("NEXT_PUBLIC_SSE_URL", "")

    await expect(loadConfig()).rejects.toThrow(/NEXT_PUBLIC_SSE_URL/)
  })
})
