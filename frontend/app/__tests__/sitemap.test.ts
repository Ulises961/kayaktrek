import { describe, it, expect } from "vitest"
import { siteUrl } from "@/lib/seo/robots"
import sitemap from "@/app/sitemap"

describe("sitemap", () => {
  // Route enumeration is paused (2026-09-07, decided independently of M25 §1's
  // registration change) until §5's real routes are live — /explore and /routes/<id> are
  // also in lib/seo/robots.ts's DISALLOWED_PATHS right now, so listing them here would
  // contradict robots.txt.
  it("lists only the static indexable pages", async () => {
    const entries = await sitemap()

    expect(entries.map((e) => e.url)).toEqual([
      siteUrl("/"),
      siteUrl("/about"),
      siteUrl("/terms"),
      siteUrl("/privacy"),
    ])
  })

  it("never lists /explore or a /routes/<id> URL while route enumeration is paused", async () => {
    const urls = (await sitemap()).map((e) => e.url)

    expect(urls).not.toContain(siteUrl("/explore"))
    expect(urls.some((u) => u.includes("/routes/"))).toBe(false)
  })
})
