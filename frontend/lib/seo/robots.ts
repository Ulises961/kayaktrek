import { AUTH_GATED_PREFIXES } from "@/proxy"

// The public origin, used to build absolute URLs for robots.txt and the sitemap. Server-only
// (both are rendered on the server), so this is a plain env var rather than a NEXT_PUBLIC_ one
// — nothing here reaches the client bundle and it needs no build arg. Same name the backend
// already uses for the same concept, so the deploy set carries one variable, not two.
const ORIGIN = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")

export function siteUrl(path: string): string {
  return `${ORIGIN}/${path.replace(/^\/+/, "")}`
}

// Page-level metadata for the tokenised share surfaces. robots.txt asks a crawler not to
// fetch these; this tells anything that fetched one anyway not to index it — which is the
// half that reaches link-preview fetchers, since they ignore robots.txt entirely.
export const UNLISTED = {
  robots: { index: false, follow: false },
} as const

// Anonymous-reachable pages worth crawling. `/routes/<id>` is not here because it is
// enumerated from the live library in `app/sitemap.ts`.
export const INDEXABLE_PATHS = ["/", "/explore", "/terms", "/privacy"]

// robots.txt matches by prefix, so each entry covers itself and everything beneath it.
//
// Three groups, for three different reasons:
//   - everything proxy.ts gates: crawling it yields a login redirect, nothing more.
//   - the tokenised share surfaces: unlisted by design. A float-plan or story link is
//     pasted into WhatsApp and mail, and an indexed one is a privacy failure, not a
//     crawl-budget one.
//   - the token-bearing auth callbacks: single-use links that mean nothing to a crawler.
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
