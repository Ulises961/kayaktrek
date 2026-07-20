"use client"
import { useEffect } from "react"
import { useBreadcrumbContext } from "@/components/common/breadcrumb-context"
import type { Crumb } from "@/lib/types/ui"

export function useBreadcrumbs(crumbs: Crumb[]) {
  const { setCrumbs } = useBreadcrumbContext()
  const key = JSON.stringify(crumbs)

  useEffect(() => {
    setCrumbs(crumbs)
    return () => setCrumbs([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
