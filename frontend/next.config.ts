import type { NextConfig } from "next"

// Report-Only: this app talks to Flask exclusively through server actions/RSC (never
// client-side fetch — see coding-rules-frontend), so connect-src 'self' is already accurate.
// img-src stays broad (https: + dev MinIO) because the storage origin is deploy-configurable
// (MinIO locally, swappable for S3 — StorageService abstraction) and images carry no XSS risk.
// Promote to enforcing once report-only is quiet in dev + e2e (M11 §3).
function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: http://localhost:9000",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ")
}

const nextConfig: NextConfig = {
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
      { key: "Content-Security-Policy-Report-Only", value: buildCsp() },
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
