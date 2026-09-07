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

  // Reversed 2026-09-07, independent of M25 §1's registration change: opening
  // registration to testers and opening the library to search engines are two different
  // decisions. /explore isn't populated yet (§5 still open) — indexing and caching a thin
  // library is a worse, slower-to-reverse first impression than a few more days of
  // noindex. Reinstate once §5's real routes are live.
  it("disallows the discovery surface until the library has real content (temporary)", () => {
    expect(DISALLOWED_PATHS).toContain("/explore")
    expect(DISALLOWED_PATHS).toContain("/routes")
  })
})

describe("INDEXABLE_PATHS", () => {
  it("lists the anonymous-reachable pages that should be crawled", () => {
    expect(INDEXABLE_PATHS).toEqual(["/", "/about", "/terms", "/privacy"])
  })

  it("shares no entry with the disallow list", () => {
    for (const path of INDEXABLE_PATHS) {
      expect(DISALLOWED_PATHS).not.toContain(path)
    }
  })
})
