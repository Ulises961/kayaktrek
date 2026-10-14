// Expo inlines `EXPO_PUBLIC_*` vars into the client bundle at build time (the RN
// equivalent of Next's `NEXT_PUBLIC_*`, see frontend/lib/api/config.ts) — unset in
// production must fail loudly rather than silently point at localhost, which would
// be unreachable from a real device and fail in a way that gives no signal why.
function resolveOrigin(value: string | undefined, fallback: string, variable: string): string {
  if (value) return value
  if (!__DEV__) {
    throw new Error(`${variable} is unset. Set it in eas.json / the build profile's env.`)
  }
  return fallback
}

// Dev fallback assumes the simulator/emulator can reach the host machine directly.
// Android emulators need 10.0.2.2, not localhost — set EXPO_PUBLIC_API_URL for that
// case rather than hardcoding a platform branch here.
export const API_URL = resolveOrigin(
  process.env.EXPO_PUBLIC_API_URL,
  "http://localhost:5000",
  "EXPO_PUBLIC_API_URL",
)

// The SSE sidecar's origin (ADR-033) — a separate host in production, the same role as
// frontend/lib/api/config.ts's SSE_URL. The trip-changes poll (M36) goes here.
export const SSE_URL = resolveOrigin(
  process.env.EXPO_PUBLIC_SSE_URL,
  "http://localhost:5001",
  "EXPO_PUBLIC_SSE_URL",
)

// Mirrors frontend/lib/api/config.ts's API_VERSION/API_PREFIX exactly — same backend,
// same versioning scheme (ADR-031).
export const API_VERSION = "v1"
export const API_PREFIX = `/api/${API_VERSION}`
