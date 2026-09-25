import type { MetadataRoute } from "next"
import { DISALLOWED_PATHS, siteUrl } from "@/lib/seo/robots"

// M25 §1. The beta plan called for a blanket `noindex`; an open 1.0 wants the opposite,
// because `/explore` and the public route pages are the discovery channel M23 built.
// What survives from the beta item is the disallow list — see `lib/seo/robots.ts` for
// why each group is on it.

// Without this, Next prerenders the file at build, where `FRONTEND_URL` is not set, and
// production serves `Sitemap: http://localhost:3000/...` however the container is configured.
export const dynamic = "force-dynamic"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOWED_PATHS }],
    sitemap: siteUrl("/sitemap.xml"),
  }
}
