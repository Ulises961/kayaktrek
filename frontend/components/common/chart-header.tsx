import type { ReactNode } from "react"
import { BrandLockup } from "@/components/common/brand-lockup"
import { ThemeToggle } from "@/components/common/theme-toggle"
import { cn } from "@/lib/utils"

interface ChartHeaderBarProps {
  className?: string
  nav?: ReactNode
  // Forwarded to `BrandLockup`'s `subtitle`. Defaults on — this strip is the header
  // for every anonymous-facing page (landing, auth, terms, share links), all wide
  // enough to carry it, and it's already hidden below `sm` (mobile) by
  // `BrandLockup`'s own default. Pass `brandSubtitle=""` to suppress it for a caller
  // that genuinely needs the bare wordmark — `undefined` re-triggers this default
  // instead of clearing it.
  brandSubtitle?: string
}

// Chart publication strip — the "paper" header bar shared by the landing hero,
// the auth pages, and the authenticated app shell, for one consistent header
// treatment across all three. Positioning/z-index is context-specific (landing
// is `absolute` inside a fixed-height hero above an interactive map at
// z-[1001]; auth is `fixed` above a non-interactive, negative-z backdrop so it
// only needs z-10), so the caller owns those via `className`. `nav` is
// optional — auth pages have no header nav, their cross-links live inside the
// card.
//
// The theme toggle is unconditional, unlike `nav`. Every anonymous-facing page
// in the app renders through this strip and none of them has anywhere else to
// put it — before this, the control lived only in the authenticated shell, so a
// visitor who landed in dark mode had to sign in to get back out of it.
export function ChartHeaderBar({
  className,
  nav,
  brandSubtitle = "Sea-kayak expedition planner",
}: ChartHeaderBarProps) {
  return (
    <header
      className={cn("chart-header flex items-center justify-between px-5 py-3 sm:px-7", className)}
    >
      {/* Wordmark drops below `sm`, same collapse-to-glyph the app shell uses when its
          breadcrumb needs the width (`app/(app)/layout.tsx`) — here it's `nav` (Log in /
          Sign up) that needs it. At 320 "Kayaktrek" plus both buttons has no room and
          "Log in" wraps mid-word; the glyph alone leaves the nav its full width. */}
      <BrandLockup
        wordmarkClassName="hidden text-[0.95rem] sm:inline sm:text-base"
        subtitle={brandSubtitle}
      />
      <nav className="flex items-center gap-1 sm:gap-3">
        {nav}
        <ThemeToggle className="chart-header-toggle" />
      </nav>
    </header>
  )
}
