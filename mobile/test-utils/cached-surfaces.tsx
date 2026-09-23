import type { ReactNode } from "react"

import { OfflineBanner } from "../components/ui/offline-banner"
import { CachedSurfacesProvider } from "../lib/network/cached-surfaces"

// What app/_layout.tsx provides: the shared state screens report their cached
// data into. Every Screen renders its own offline banner from it
// (components/ui/layout.tsx), so a screen test needs only this. Pass as RNTL's
// `wrapper`.
export function WithCachedSurfaces({ children }: { children: ReactNode }) {
  return <CachedSurfacesProvider>{children}</CachedSurfacesProvider>
}

// For tests of a notice on its own, with no Screen around it to render the
// banner that says what the notice reported.
export function WithBannerOnly({ children }: { children: ReactNode }) {
  return (
    <CachedSurfacesProvider>
      {children}
      <OfflineBanner />
    </CachedSurfacesProvider>
  )
}
