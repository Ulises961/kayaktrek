/// <reference types="node" />
// Scoped here rather than adding "node" to tsconfig's `types`, which would put
// Node globals in scope for app code that runs on a phone and has none.
import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"

import { lightTokens, palette } from "@shared/tokens"

import { stackScreenOptions } from "../lib/navigation-theme"

const MOBILE_ROOT = join(__dirname, "..")
const APP_DIR = join(MOBILE_ROOT, "app")

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })
}

function stackLayouts(): { file: string; source: string }[] {
  return walk(APP_DIR)
    .filter((file) => file.endsWith("_layout.tsx"))
    .map((file) => ({ file: relative(MOBILE_ROOT, file), source: readFileSync(file, "utf8") }))
    .filter((layout) => /<Stack[\s/>]/.test(layout.source))
}

describe("stackScreenOptions", () => {
  // Every screen sets its own title in-file (M9b's duplicate-registration gotcha),
  // so the header's *appearance* has no other home than the group's Stack. Before
  // this, all five groups rendered a bare <Stack /> and got React Navigation's
  // default chrome: an oversized black system title on plain white.
  it("paints the header from the app's own palette, not the platform default", () => {
    expect(stackScreenOptions.headerStyle.backgroundColor).toBe(lightTokens.background)
    expect(stackScreenOptions.headerTitleStyle.color).toBe(lightTokens.foreground)
    expect(stackScreenOptions.headerTintColor).toBe(palette.ocean700)
  })

  // Web's .chart-header-app separates the strip with a 16% chart-hairline rule,
  // not a drop shadow. The native default is a shadow, so it has to be turned off
  // explicitly or the two platforms read differently at the same spot.
  it("drops the platform's header shadow", () => {
    expect(stackScreenOptions.headerShadowVisible).toBe(false)
  })

  it("hardcodes no colour of its own", () => {
    const source = readFileSync(join(MOBILE_ROOT, "lib", "navigation-theme.ts"), "utf8")
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})

describe("stack layouts", () => {
  // Guard against a vacuous pass: if the walk found nothing, the assertion below
  // would hold over an empty list.
  it("finds the group layouts that render a Stack", () => {
    expect(stackLayouts().length).toBeGreaterThanOrEqual(5)
  })

  // The failure this prevents is a new drawer group shipping with default chrome
  // while every existing one is themed — visible only on a device, and only if
  // someone happens to open that group.
  it("applies the shared theme in every one of them", () => {
    const unthemed = stackLayouts()
      .filter((layout) => !layout.source.includes("stackScreenOptions"))
      .map((layout) => layout.file)

    expect(unthemed).toEqual([])
  })
})
