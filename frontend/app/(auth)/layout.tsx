import React from "react"
import Link from "next/link"
import { ChartBackdrop } from "@/components/auth/chart-backdrop"
import { CompassRose } from "@/components/landing/compass-rose"
import { fetchLandingRoutes } from "@/lib/landing/fetch-routes"

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const routes = await fetchLandingRoutes()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <ChartBackdrop routes={routes} />

      {/* Chart identity mark — top-left, matches the landing header. */}
      <Link
        href="/"
        className="fixed top-6 left-6 z-10 flex items-center gap-2.5 opacity-90 transition-opacity hover:opacity-100"
      >
        <CompassRose size={24} />
        <span className="chart-wordmark text-sm">Kayak Expedition Planner</span>
      </Link>

      {/* Auth card */}
      <div className="z-10 w-full max-w-sm">{children}</div>
    </div>
  )
}
