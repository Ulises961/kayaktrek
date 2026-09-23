import { AUTH_GATED_PREFIXES } from "@/proxy"

// `siteUrl` moved to ./origin so the root layout can build absolute OpenGraph URLs without
// importing this module, which pulls in `@/proxy`. Re-exported rather than relocated at the
// call sites: robots, sitemap and their tests all read it from here, and nothing about those
// changed.
export { siteUrl } from "./origin"

// Page-level metadata for the tokenised share surfaces. robots.txt asks a crawler not to
// fetch these; this tells anything that fetched one anyway not to index it — which is the
// half that reaches link-preview fetchers, since they ignore robots.txt entirely.
export const UNLISTED = {
  robots: { index: false, follow: false },
} as const

// Anonymous-reachable pages worth crawling. `/routes/<id>` is not here because it is
// enumerated from the live library in `app/sitemap.ts`.
export const INDEXABLE_PATHS = ["/", "/about", "/explore", "/terms", "/privacy"]

// robots.txt matches by prefix, so each entry covers itself and everything beneath it.
//
// Three groups, for three different reasons:
//   - everything proxy.ts gates: crawling it yields a login redirect, nothing more.
//   - the tokenised share surfaces: unlisted by design. A float-plan or story link is
//     pasted into WhatsApp and mail, and an indexed one is a privacy failure, not a
//     crawl-budget one.
//   - the token-bearing auth callbacks: single-use links that mean nothing to a crawler.
//
// `/explore` and `/routes` were temporarily disallowed from 2026-09-07 while the public
// library held only the operator's own demo content (§5 of `plans/M25-web-1.0-release.md`
// was still open). Reinstated 2026-09-12 once two real, author-pitched routes were
// published — text description + difficulty grade was judged enough to be worth crawling;
// photos and a trip narrative (M7d) are a nice-to-have for future routes, not a gate on
// these two, since neither exists for trips that predate the app.
//
// `/paddlers` covers the gated connections page *and* the public `/paddlers/<username>`
// profile beneath it. That is deliberate: a profile carries a real person's logs,
// certifications and endorsements, and this app has consistently made public exposure
// opt-in (`Image.is_public`, point notes never public). Search-indexing profiles by
// default would be the one place that pattern breaks. It stays crawlable-on-request —
// nothing stops an owner sharing the URL — it is simply not enumerated to crawlers.
export const DISALLOWED_PATHS = [
  ...AUTH_GATED_PREFIXES,
  // Not in AUTH_GATED_PREFIXES: proxy.ts gates it as an exact match, precisely because
  // the public profile route shares its prefix. Here the prefix match is what we want.
  "/paddlers",
  "/float-plan",
  "/story",
  "/verify",
  "/verify-email-change",
  "/reset-password",
  "/cancel-deletion",
  "/download-export",
]
