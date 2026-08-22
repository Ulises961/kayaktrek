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
  //
  // `next start` refuses to serve a standalone build (it tells you to run
  // .next/standalone/server.js instead), and that build does not carry static assets or
  // public/ without an extra copy step. e2e/run-live-stack.sh serves the app with
  // `next start`, so it opts out — the harness exercises the app, not the packaging.
  ...(process.env.NEXT_OUTPUT_STANDALONE === "0" ? {} : { output: "standalone" as const }),
  // The tracer resolves @swc/helpers through its `require` export condition and copies only
  // the two `cjs/*.cjs` files it lands on, but Next's own require-hook resolves the same
  // specifiers through the `import` condition at runtime and asks for `esm/*.js`. The
  // standalone server then dies on its first module load with MODULE_NOT_FOUND — the whole
  // image restart-loops, and nothing in the build says a word about it. Ship the package
  // whole rather than the half the tracer picked.
  //
  // The pnpm store path is matched with a version wildcard so a bump doesn't silently stop
  // matching; `outputFileTracingIncludes` accepts a glob and quietly includes nothing when it
  // matches nothing, which is exactly how this class of breakage goes unnoticed.
  outputFileTracingIncludes: {
    "**/*": ["./node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*"],
  },
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
