import React from "react"
import { ChartBackdrop } from "@/components/auth/chart-backdrop"
import { ChartHeaderBar } from "@/components/common/chart-header"
import { fetchLandingRoutes } from "@/lib/landing/fetch-routes"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const routes = await fetchLandingRoutes()

  // Card anchors bottom-left on desktop — the same spot as the landing cartouche
  // (left-9 / bottom-9), so moving landing ↔ auth the title block stays put.
  // Centered on mobile, where the scrim washes the chart out around it. Top
  // padding is taller than the bottom (pt-20 vs pb-12) to clear the full-width
  // header.
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 pt-20 pb-12 sm:items-start sm:justify-end sm:p-9">
      <ChartBackdrop routes={routes} />

      {/* Chart identity strip — full-width bar matching the landing header (same
          component, same visual language). `fixed` (not `absolute` like landing)
          since this layout isn't a fixed-height hero and content can scroll
          under it. z-10 matches the auth card's z-10 — it doesn't need
          landing's z-[1001] because ChartBackdrop's own `fixed inset-0 -z-10`
          wrapper already caps everything the map renders internally below the
          root stacking context. No nav — the auth cards already carry their
          own "Already have an account?" / equivalent cross-links. */}
      <ChartHeaderBar className="fixed inset-x-0 top-0 z-10" />

      {/* Auth card */}
      <div className="z-10 w-full max-w-sm">{children}</div>
    </div>
  )
}
