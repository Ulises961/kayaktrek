import type { NextConfig } from "next"

// CSP lives in proxy.ts, not here — a nonce-based policy needs a fresh value per request,
// which next.config.ts's headers() (computed once, statically) cannot provide. See proxy.ts
// for the enforcing, nonced Content-Security-Policy.

const nextConfig: NextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
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
