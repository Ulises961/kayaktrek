"use client"
import { useEffect } from "react"
import { useContentArea } from "@/components/common/content-area-context"

export function useFullBleedContent() {
  const { setFullBleed } = useContentArea()

  useEffect(() => {
    setFullBleed(true)
    return () => setFullBleed(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
