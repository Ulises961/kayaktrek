"use client"

import Link from "next/link"
import { BrandMark } from "@/components/common/brand-mark"
import { cn } from "@/lib/utils"
import { forceNavigate } from "@/lib/utils/navigation"

interface BrandLockupProps {
  // "/" from the public surfaces; the authenticated shell points it at the
  // dashboard, which is home once you are signed in.
  href?: string
  size?: number
  className?: string
  wordmarkClassName?: string
  // Off by default — see the note beside its render below for why. `ChartHeaderBar`
  // defaults its own `brandSubtitle` to this same copy, so every page it fronts gets
  // it automatically; a bespoke `BrandLockup` call (the app shell, the route-detail
  // panel) opts in explicitly instead.
  subtitle?: string
  // Visibility breakpoint for `subtitle` — defaults to appearing from `sm` (i.e.
  // hidden on mobile, shown everywhere wider). The app shell's wordmark itself is
  // gated to `md` (the breadcrumb needs the width below that), so its subtitle
  // passes `md:inline-flex` here to never show without the wordmark it's attached to.
  subtitleClassName?: string
}

// Mark + wordmark, shared by every header (landing, auth, terms, app shell) so
// the name lives at exactly one call site.
export function BrandLockup({
  href = "/",
  size = 26,
  className,
  wordmarkClassName,
  subtitle,
  subtitleClassName = "sm:inline-flex",
}: BrandLockupProps) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2.5", className)}
      onClick={(e) => {
        // Next's client router treats a Link to the current URL as a no-op — on
        // the anonymous root (`LandingExplore`) that left `ExploreDiscovery`'s
        // search/filter state (client-only, never synced to the URL) untouched,
        // so clicking the logo while already home looked like a dead link. Force
        // a real navigation in that one case so the destination page remounts
        // fresh, same as landing on it from anywhere else would. Reads
        // `window.location` directly (not `usePathname()`) so this stays a plain
        // click-time check instead of a hook every render needs an app-router
        // context for — `BrandLockup` renders in several server-component trees
        // that tests exercise with no router mock.
        if (typeof window !== "undefined" && window.location.pathname === href) {
          e.preventDefault()
          forceNavigate(href)
        }
      }}
    >
      <BrandMark size={size} />
      {/* No descriptor by default. This sits in a slim chart-publication strip beside
          a 26px mark and has to hold at the 320px floor, which is exactly where a
          tagline would either wrap or push the header wide — the descriptor lives in
          the page title and the landing copy instead, everywhere `subtitle` isn't
          passed. */}
      <span className={cn("chart-wordmark", wordmarkClassName)}>Kayaktrek</span>
      {subtitle && (
        // `hidden sm:inline`, not `sr-only sm:not-sr-only`: this is decorative copy
        // duplicating what the landing cartouche already says, not a label losing
        // meaning for a screen reader at 320 — nothing here needs to survive that
        // floor the way a control's accessible name would.
        //
        // Same typography family as `.chart-eyebrow` (mono, wide-tracked,
        // `--chart-ink-quiet`) — that's what the cartouche uses to pair a small label
        // with a bigger title (`CartoucheEyebrow` above `CartoucheTitle`), so this
        // reads as the wordmark's own tagline instead of unrelated header copy that
        // happens to sit next to it. Not the `.chart-eyebrow` class itself: it's
        // unlayered CSS (globals.css, outside any `@layer`) and forces uppercase,
        // which beats any Tailwind `normal-case` override regardless of source order
        // (`.chart-eyebrow` isn't in `@layer utilities`, `normal-case` is) — see
        // frontend/CLAUDE.md's `@layer components` note. A thin rule instead of a dot:
        // a dot is a list/breadcrumb separator between two peers, a rule is a divider
        // inside one unit.
        <span
          className={cn(
            "hidden items-center gap-2.5 pl-2.5 font-mono text-[0.625rem] tracking-[0.2em] text-[var(--chart-ink-quiet)]",
            subtitleClassName,
          )}
        >
          <span aria-hidden className="h-3 w-px bg-[var(--chart-hairline)]" />
          {subtitle}
        </span>
      )}
    </Link>
  )
}
