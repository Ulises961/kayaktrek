"use client"
import { useEffect } from "react"
import { useSidebar } from "@/components/ui/sidebar"

export function useCollapseSidebar() {
  const { open, setOpen } = useSidebar()

  useEffect(() => {
    const wasOpen = open
    setOpen(false)
    return () => setOpen(wasOpen)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
