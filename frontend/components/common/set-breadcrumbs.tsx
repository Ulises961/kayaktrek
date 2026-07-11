"use client"
import { useBreadcrumbs } from "@/hooks/use-breadcrumbs"
import type { Crumb } from "@/lib/types/ui"

export function SetBreadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  useBreadcrumbs(crumbs)
  return null
}
