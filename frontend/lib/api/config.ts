// `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time, and an unset
// repo Variable arrives as an empty string rather than as undefined (`frontend-ci.yml`
// passes `${{ vars.* }}` straight through to a Dockerfile `ARG`). An empty base URL is
// therefore a misconfiguration, never a value: it would make every request a relative,
// same-origin URL pointing back at the Next.js server, which fails with no CORS error
// and nothing in the backend logs. In production that must break the build; in dev an
// unset var still falls back to the local ports.
function resolveOrigin(value: string | undefined, fallback: string, variable: string): string {
  if (value) return value

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${variable} is unset or empty. It is baked into the client bundle at build time, ` +
        `so it must be set as a repo Variable before the image is built (see DEPLOY.md).`,
    )
  }

  return fallback
}

export const API_URL = resolveOrigin(
  process.env.NEXT_PUBLIC_API_URL,
  "http://localhost:5000",
  "NEXT_PUBLIC_API_URL",
)

// API version. Bump when the backend introduces a breaking `/api/v2` surface.
export const API_VERSION = "v1"
export const API_PREFIX = `/api/${API_VERSION}`

// The M8 SSE sidecar (ADR-033) — a separate gevent-worker process from the main
// sync-worker backend, since long-lived EventSource connections would otherwise
// starve the request pool. Dev: two ports, no proxy (docker-compose.yml). Prod: one
// public origin, nginx routes `/api/v1/live/.../stream` here (see the M8 plan
// Appendix — reverse-proxy routing sketch).
export const SSE_URL = resolveOrigin(
  process.env.NEXT_PUBLIC_SSE_URL,
  "http://localhost:5001",
  "NEXT_PUBLIC_SSE_URL",
)
