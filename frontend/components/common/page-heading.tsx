import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeadingProps {
  children: ReactNode
  className?: string
}

// The one canonical page-title style across the app. Every section page's
// <h1> renders through this instead of hand-rolling its own size/weight,
// which had drifted (text-lg on Explore, no size at all via the old
// pathname-derived CurrentPageTitle on Trips, a mobile-only downsize on
// Itinerary). Responsive by default — generalizes Itinerary's existing
// mobile-conscious scale (smaller on phones, text-2xl from sm+) rather than
// flattening every page to desktop's plain text-2xl.
export function PageHeading({ children, className }: PageHeadingProps) {
  return <h1 className={cn("text-xl font-semibold sm:text-2xl", className)}>{children}</h1>
}
