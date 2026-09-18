/// <reference types="node" />
// Scoped here rather than adding "node" to tsconfig's `types`, which would put
// Node globals in scope for app code that runs on a phone and has none.
import { readdirSync, readFileSync, statSync } from "fs"
import { join, relative, sep } from "path"

// Every screen test renders its component directly with expo-router's Link and
// Stack.Screen stubbed inert, so no test in the suite ever resolves an href
// against the real route tree. That gap let three dead links ship: /logs/[id],
// /logs/new and /profile/edit all pointed at routes that do not exist, and
// tapping a log card opened expo-router's "Unmatched Route" 404 instead of the
// log — online and offline alike, found only by driving a real device.
//
// This is a static check on purpose: it needs no navigator, so it cannot be
// defeated by the same stubbing that hid the bug.

const MOBILE_ROOT = join(__dirname, "..")
const APP_DIR = join(MOBILE_ROOT, "app")
const SOURCE_DIRS = [APP_DIR, join(MOBILE_ROOT, "components")]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith(".tsx") || full.endsWith(".ts") ? [full] : []
  })
}

// app/(app)/(drawer)/(trips)/trips/[id]/items.tsx -> /trips/[id]/items
// A parenthesised segment is a route GROUP: it organises files and supplies a
// layout, and contributes nothing to the URL. That is the whole bug — (logs)
// looks like it should produce /logs/... and does not.
function toRoutePattern(file: string): string {
  const segments = relative(APP_DIR, file)
    .replace(/\.tsx$/, "")
    .split(sep)
    .filter((segment) => !/^\(.+\)$/.test(segment))
  if (segments[segments.length - 1] === "index") segments.pop()
  return `/${segments.join("/")}`
}

function routePatterns(): string[] {
  return walk(APP_DIR)
    .filter((file) => file.endsWith(".tsx") && !file.endsWith("_layout.tsx"))
    .map(toRoutePattern)
}

type NavigationTarget = { path: string; file: string }

// Only literal targets: href="/x" and { pathname: "/x" }. A computed href
// (href={href}) carries no string to check here — the trip hub's link list is
// the one such case, and its targets are covered by the patterns it builds.
function navigationTargets(): NavigationTarget[] {
  const pattern = /(?:href=\s*"|pathname:\s*")(\/[^"]*)"/g
  return SOURCE_DIRS.flatMap(walk)
    .filter((file) => !file.includes(`${sep}__tests__${sep}`))
    .flatMap((file) => {
      const source = readFileSync(file, "utf8")
      return [...source.matchAll(pattern)].map((match) => ({
        path: match[1],
        file: relative(MOBILE_ROOT, file),
      }))
    })
}

describe("route tree", () => {
  // Guard against a vacuous pass: if the walk or the regex silently matched
  // nothing, every assertion below would hold over an empty set.
  it("finds the route tree and the navigation targets", () => {
    expect(routePatterns().length).toBeGreaterThan(10)
    expect(navigationTargets().length).toBeGreaterThan(3)
  })

  it("points every literal href at a route that exists", () => {
    const routes = new Set(routePatterns())

    const broken = navigationTargets()
      .filter((target) => !routes.has(target.path))
      .map((target) => `${target.file} -> ${target.path}`)

    expect(broken).toEqual([])
  })

  it("keeps a real path segment for each section, so its screens get distinct URLs", () => {
    const routes = routePatterns()

    // Several sections legitimately share "/" — each drawer item's own root
    // screen. What must not happen is a section's CHILD screens collapsing to
    // the root too, which is what a group with no real directory segment does.
    const nonRoot = routes.filter((route) => route !== "/")
    expect(new Set(nonRoot).size).toBe(nonRoot.length)
  })

  // The subtler half of the same bug: two dynamic routes sharing a parent match
  // the same URL, and which one wins is not something the file tree says. Before
  // the logs and profile screens moved under real segments, /[id] (a log) and
  // /[username] (a paddler profile) were BOTH root-level single-segment dynamic
  // routes — textually distinct, so the uniqueness check above missed them,
  // while any /<something> would have matched either.
  it("never leaves two dynamic routes competing for the same URL", () => {
    const byParent = new Map<string, string[]>()

    for (const route of routePatterns()) {
      const segments = route.split("/")
      const last = segments[segments.length - 1]
      if (!last?.startsWith("[")) continue
      const parent = segments.slice(0, -1).join("/") || "/"
      byParent.set(parent, [...(byParent.get(parent) ?? []), route])
    }

    const ambiguous = [...byParent.entries()]
      .filter(([, routes]) => routes.length > 1)
      .map(([parent, routes]) => `${parent}: ${routes.join(" vs ")}`)

    expect(ambiguous).toEqual([])
  })
})
