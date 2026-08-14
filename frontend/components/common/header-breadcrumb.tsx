"use client"
import { PageBreadcrumb } from "./page-breadcrumb"
import { useBreadcrumbContext } from "./breadcrumb-context"
import { Separator } from "@/components/ui/separator"

// The trail sits in the app header rather than above each page's heading, so
// that the itinerary builder has somewhere to put it: that page is a `bleed`
// layout — the map IS the page — with no content column and no heading to hang
// a trail under. One location beats a page-level trail plus a header fallback.
//
// The rule is part of this component, not the header, because it only earns its
// place when there are crumbs to divide from. Without it the trail butts against
// the wordmark and reads as a continuation of the product name.
//
// From `sm` only. Every route that sets a trail — /settings,
// /settings/change-password, /profile/edit, /trips/[id] — ends it in a leaf that
// repeats that page's own `PageHeading` a line below, so on a phone the trail
// spends the header's scarcest width restating the title. What it adds beyond
// that is one link to the parent, and each parent is a tap away in the nav drawer
// (Trips) or the account menu (Profile, Settings). The wrapper stays mounted at
// every width: it is also the flex spacer that holds the trailing controls to the
// right edge.
export function HeaderBreadcrumb() {
  const { crumbs } = useBreadcrumbContext()
  if (crumbs.length === 0) return null
  return (
    <div className="hidden min-w-0 flex-1 items-center gap-3 sm:flex">
      <Separator orientation="vertical" className="h-4 shrink-0" />
      {/* The trail is the one thing in the header that can be arbitrarily long — a trip
          name goes in it — so it is what gives way when the row runs out of width. The
          controls at the far end (requests, theme, account) are fixed-size and must not be
          pushed off; a truncated crumb is still readable, an off-screen avatar is not. */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <PageBreadcrumb crumbs={crumbs} />
      </div>
    </div>
  )
}
