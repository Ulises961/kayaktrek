"use client"
import { PageBreadcrumb } from "./page-breadcrumb"
import { useBreadcrumbContext } from "./breadcrumb-context"

export function HeaderBreadcrumb() {
  const { crumbs } = useBreadcrumbContext()
  if (crumbs.length === 0) return null
  return <PageBreadcrumb crumbs={crumbs} />
}
