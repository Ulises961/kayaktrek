// The public origin, and the absolute-URL helper built on it.
//
// Split out of `robots.ts` so the root layout can resolve `metadataBase` without importing
// that module, which pulls in `@/proxy` for the gated-path list. The root layout renders on
// every request, and the middleware's route table has no business travelling with it.
//
// Server-only (robots, sitemap and the layout's metadata all render on the server), so this
// is a plain env var rather than a NEXT_PUBLIC_ one — nothing here reaches the client bundle
// and it needs no build arg. Same name the backend already uses for the same concept, so the
// deploy set carries one variable, not two.
const ORIGIN = (process.env.FRONTEND_URL ?? "http://localhost:3000").replace(/\/+$/, "")

export function siteUrl(path: string): string {
  return `${ORIGIN}/${path.replace(/^\/+/, "")}`
}

/** `metadataBase` for Next — what relative OpenGraph/Twitter image paths resolve against. */
export function siteOrigin(): URL {
  return new URL(ORIGIN)
}
