import type { ReactNode } from "react"
import Link from "next/link"
import { CompassRose } from "@/components/landing/compass-rose"
import { cn } from "@/lib/utils"

interface ChartHeaderBarProps {
  className?: string
  nav?: ReactNode
}

// Chart publication strip — the "paper" header bar shared by the landing hero,
// the auth pages, and the authenticated app shell, for one consistent header
// treatment across all three. Positioning/z-index is context-specific (landing
// is `absolute` inside a fixed-height hero above an interactive map at
// z-[1001]; auth is `fixed` above a non-interactive, negative-z backdrop so it
// only needs z-10), so the caller owns those via `className`. `nav` is
// optional — auth pages have no header nav, their cross-links live inside the
// card.
export function ChartHeaderBar({ className, nav }: ChartHeaderBarProps) {
  return (
    <header
      className={cn("chart-header flex items-center justify-between px-5 py-3 sm:px-7", className)}
    >
      <Link href="/" className="flex items-center gap-2.5">
        <CompassRose size={26} />
        <span className="chart-wordmark text-[0.95rem] sm:text-base">Kayak Expedition Planner</span>
      </Link>
      {nav ? <nav className="flex items-center gap-1 sm:gap-3">{nav}</nav> : null}
    </header>
  )
}
