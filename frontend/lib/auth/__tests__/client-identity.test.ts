import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("next/headers", () => ({ headers: vi.fn() }))

import { headers } from "next/headers"
import { clientIdentityHeaders } from "../client-identity"

function withIncoming(entries: Record<string, string>) {
  vi.mocked(headers).mockResolvedValue({
    get: (name: string) => entries[name.toLowerCase()] ?? null,
  } as unknown as Awaited<ReturnType<typeof headers>>)
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0 Safari/537.36"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CLIENT_FORWARDING_SECRET = "s3cret-forwarding-key"
})

afterEach(() => {
  delete process.env.CLIENT_FORWARDING_SECRET
})

describe("clientIdentityHeaders", () => {
  it("forwards the browser's user agent with the shared secret", async () => {
    withIncoming({ "user-agent": BROWSER_UA })

    const forwarded = await clientIdentityHeaders()

    expect(forwarded["X-Client-User-Agent"]).toBe(BROWSER_UA)
    expect(forwarded["X-Client-Forwarded"]).toBe("s3cret-forwarding-key")
  })

  it("forwards the browser's location, not the server's", async () => {
    // The whole point: the backend sees our datacentre, the browser's request saw the
    // paddler. Cloudflare put these on that request.
    withIncoming({
      "user-agent": BROWSER_UA,
      "cf-ipcity": "Genoa",
      "cf-region": "Liguria",
      "cf-ipcountry": "IT",
    })

    const forwarded = await clientIdentityHeaders()

    expect(forwarded).toMatchObject({
      "X-Client-City": "Genoa",
      "X-Client-Region": "Liguria",
      "X-Client-Country": "IT",
    })
  })

  it("reads the region under either name Cloudflare has shipped it as", async () => {
    withIncoming({ "cf-ipregion": "Liguria", "cf-ipcountry": "IT" })

    expect(await clientIdentityHeaders()).toMatchObject({ "X-Client-Region": "Liguria" })
  })

  it("does not use Cloudflare's own header names", async () => {
    // Cloudflare rewrites its own headers on any request it proxies, so forwarding under
    // those names would let the frontend→backend hop overwrite ours with the server's —
    // the original bug, reintroduced by the fix.
    withIncoming({ "user-agent": BROWSER_UA, "cf-ipcountry": "IT" })

    const forwarded = await clientIdentityHeaders()

    expect(Object.keys(forwarded).every((name) => !name.toLowerCase().startsWith("cf-"))).toBe(true)
  })

  it("sends nothing at all when no secret is configured", async () => {
    // Unforwarded headers the backend would ignore are pure noise, and sending them would
    // suggest a deployment is doing something it is not.
    delete process.env.CLIENT_FORWARDING_SECRET
    withIncoming({ "user-agent": BROWSER_UA, "cf-ipcountry": "IT" })

    expect(await clientIdentityHeaders()).toEqual({})
  })

  it("omits what the incoming request did not carry", async () => {
    // Local development has no Cloudflare; an empty string must not become a location.
    withIncoming({ "user-agent": BROWSER_UA })

    const forwarded = await clientIdentityHeaders()

    expect(forwarded).not.toHaveProperty("X-Client-City")
    expect(forwarded).not.toHaveProperty("X-Client-Country")
  })
})
