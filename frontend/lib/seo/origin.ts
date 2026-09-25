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
//
// Read per call, not captured at import, so `robots.ts` and `sitemap.ts` (both
// `force-dynamic`) see the runtime environment rather than the build's.
const DEFAULT_ORIGIN = "http://localhost:3000"

function origin(): string {
  const raw = process.env.FRONTEND_URL ?? DEFAULT_ORIGIN
  // A bare host (`app.kayaktrek.app`) makes `new URL()` throw in the root layout and every
  // sitemap entry a relative path; reject it with a message that names the variable.
  if (!/^https?:\/\/[^/]/.test(raw)) {
    throw new Error(`FRONTEND_URL must start with http:// or https://, got "${raw}"`)
  }
  return raw.replace(/\/+$/, "")
}

export function siteUrl(path: string): string {
  return `${origin()}/${path.replace(/^\/+/, "")}`
}

/** `metadataBase` for Next — what relative OpenGraph/Twitter image paths resolve against. */
export function siteOrigin(): URL {
  return new URL(origin())
}
