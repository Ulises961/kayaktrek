import { describe, it, expect, vi } from "vitest"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

// next/font/google runs the loader at import time and is a build-time transform, so it has
// no implementation under vitest. The fonts are irrelevant here — this file only reads the
// metadata export — but the layout module cannot be imported without them.
vi.mock("next/font/google", () => {
  const font = () => ({ variable: "--font-stub", className: "font-stub" })
  return { Geist_Mono: font, DM_Sans: font, Fraunces: font }
})

const { metadata } = await import("../layout")

const APP_DIR = join(process.cwd(), "app")

describe("link-preview metadata", () => {
  it("declares an OpenGraph image so a scraper does not pick one for us", () => {
    // The bug this closes: with no og:image declared, a shared link fell back to whatever
    // the platform found — the bare compass favicon — which reads as no brand at all next
    // to a post. Next builds the image URL, dimensions and alt from the file convention,
    // so the assertion is that the file exists and metadata points at the right origin.
    expect(existsSync(join(APP_DIR, "opengraph-image.png"))).toBe(true)
    expect(metadata.metadataBase).toBeInstanceOf(URL)
  })

  it("carries alt text with the card", () => {
    const alt = readFileSync(join(APP_DIR, "opengraph-image.alt.txt"), "utf8").trim()
    expect(alt).toMatch(/kayaktrek/i)
    expect(alt.length).toBeGreaterThan(20)
  })

  it("asks X for the wide card, not a square thumbnail", () => {
    // Without summary_large_image the same 1200x630 picture is cropped into a small square
    // and the wordmark stops being legible.
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" })
  })

  it("names the product and what it is, in both previews", () => {
    expect(metadata.openGraph).toMatchObject({
      siteName: "Kayaktrek",
      title: expect.stringContaining("Kayaktrek"),
    })
    expect(metadata.openGraph?.description).toMatch(/sea-kayak/i)
    expect(metadata.twitter?.description).toMatch(/sea-kayak/i)
  })
})

describe("the share card and the app icon", () => {
  it("are drawn from the same mark", () => {
    // public/brand/social-card.svg is the source the PNG was rasterised from. It inlines
    // app/icon.svg's paths with the class fills resolved, so if the mark is ever redrawn
    // and only one of the two is regenerated, this fails rather than letting the share card
    // quietly keep the old logo. Compares the first path's geometry, which no colour or
    // layout change touches.
    const icon = readFileSync(join(APP_DIR, "icon.svg"), "utf8")
    const card = readFileSync(join(process.cwd(), "public/brand/social-card.svg"), "utf8")

    const firstPath = icon.match(/ d="([^"]+)"/)?.[1]
    expect(firstPath).toBeTruthy()
    expect(card).toContain(firstPath!)
  })
})
