"use client"
import { useEffect } from "react"
import { useContentArea } from "@/components/common/content-area-context"
import type { ContentLayout } from "@/components/common/content-area-context"

// Opt a page out of the default centred column. Resets on unmount so the next
// page always starts from "column" — a page that needs the extra width has to
// ask for it, rather than inheriting whatever the last one set.
export function useContentLayout(layout: ContentLayout) {
  const { setLayout } = useContentArea()

  useEffect(() => {
    setLayout(layout)
    return () => setLayout("column")
  }, [layout]) // eslint-disable-line react-hooks/exhaustive-deps
}
