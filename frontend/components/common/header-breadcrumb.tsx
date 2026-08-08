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
export function HeaderBreadcrumb() {
  const { crumbs } = useBreadcrumbContext()
  if (crumbs.length === 0) return null
  return (
    <>
      <Separator orientation="vertical" className="h-4" />
      <PageBreadcrumb crumbs={crumbs} />
    </>
  )
}
