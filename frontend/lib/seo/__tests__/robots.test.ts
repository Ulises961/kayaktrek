import { describe, it, expect } from "vitest"
import { AUTH_GATED_PREFIXES } from "@/proxy"
import { DISALLOWED_PATHS, INDEXABLE_PATHS, siteUrl } from "@/lib/seo/robots"

describe("siteUrl", () => {
  it("joins a path onto the configured origin without doubling the slash", () => {
    expect(siteUrl("/explore")).toBe(`${siteUrl("")}explore`)
  })

  it("produces an absolute https-or-http URL", () => {
    expect(siteUrl("/explore")).toMatch(/^https?:\/\/[^/]+\/explore$/)
  })
})

describe("DISALLOWED_PATHS", () => {
  // The invariant that matters: robots.txt must not invite a crawler into anything
  // proxy.ts gates. Asserting the list against the real gate rather than against a
  // copy means adding an (app) segment without updating robots.txt fails here.
  // robots.txt matches by prefix, so a bare "/dashboard" covers "/dashboard" and
  // everything under it. "/dashboard/" would leave the bare path crawlable.
  it("covers every prefix proxy.ts gates behind auth", () => {
    for (const prefix of AUTH_GATED_PREFIXES) {
      expect(DISALLOWED_PATHS).toContain(prefix)
    }
  })

  it("disallows the tokenised share surfaces, which are unlisted by design", () => {
    expect(DISALLOWED_PATHS).toContain("/float-plan")
    expect(DISALLOWED_PATHS).toContain("/story")
  })

  it("disallows the token-bearing auth callbacks", () => {
    expect(DISALLOWED_PATHS).toContain("/verify")
    expect(DISALLOWED_PATHS).toContain("/reset-password")
    expect(DISALLOWED_PATHS).toContain("/cancel-deletion")
  })

  it("disallows public paddler profiles — real people, indexed only on request", () => {
    expect(DISALLOWED_PATHS).toContain("/paddlers")
  })

  // Reinstated 2026-09-12 once two real, author-pitched routes were published to the
  // library (§5 of the M25 plan) — the discovery surface is no longer
  // held back from crawlers. /explore stays allowed even though it redirects an
  // anonymous crawler: disallowing it would stop the redirect ever being discovered.
  it("allows the discovery surface now that the library has real content", () => {
    expect(DISALLOWED_PATHS).not.toContain("/explore")
    expect(DISALLOWED_PATHS).not.toContain("/routes")
  })
})

describe("INDEXABLE_PATHS", () => {
  it("lists the anonymous-reachable pages that should be crawled", () => {
    expect(INDEXABLE_PATHS).toEqual(["/", "/about", "/terms", "/privacy"])
  })

  // A crawler is anonymous, and /explore answers an anonymous request with a redirect to
  // `/`. Advertising both put the same listing at two indexable URLs and a known redirect
  // in the sitemap; `/` is the canonical library, so it is the only one enumerated.
  it("does not advertise /explore, which redirects a crawler to the root", () => {
    expect(INDEXABLE_PATHS).not.toContain("/explore")
    expect(INDEXABLE_PATHS).toContain("/")
  })

  it("shares no entry with the disallow list", () => {
    for (const path of INDEXABLE_PATHS) {
      expect(DISALLOWED_PATHS).not.toContain(path)
    }
  })
})
