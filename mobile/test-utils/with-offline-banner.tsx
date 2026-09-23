import type { ReactNode } from "react"

import { OfflineBanner } from "../components/ui/offline-banner"
import { CachedSurfacesProvider } from "../lib/network/cached-surfaces"

// A screen's cached-data message is said by the app-root banner, not by the
// screen (components/ui/offline-notice.tsx), so a screen test that asserts it
// has to render the banner the way app/_layout.tsx does. Pass as RNTL's
// `wrapper`.
export function WithOfflineBanner({ children }: { children: ReactNode }) {
  return (
    <CachedSurfacesProvider>
      {children}
      <OfflineBanner />
    </CachedSurfacesProvider>
  )
}
