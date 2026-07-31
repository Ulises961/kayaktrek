import type { NextConfig } from "next"

// CSP lives in proxy.ts, not here — a nonce-based policy needs a fresh value per request,
// which next.config.ts's headers() (computed once, statically) cannot provide. See proxy.ts
// for the enforcing, nonced Content-Security-Policy.

const nextConfig: NextConfig = {
  // Lets a second `next build`/`next start` run (e.g. e2e/run-live-stack.sh) target its
  // own build output instead of the one your normal `pnpm dev` is using in the same
  // checkout — unset, this is exactly `.next`, the default.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  // Traces only the dependency subset each route actually needs into .next/standalone,
  // bundled with a minimal server.js — required for a lean self-hosted Docker image
  // (frontend/Dockerfile) instead of shipping full node_modules.
  output: "standalone",
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // geolocation=(self): Navigate mode (M8) reads the paddler's own GPS position via
      // navigator.geolocation, from our own origin only — never embedded/third-party.
      { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
    ]

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      })
    }

    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
