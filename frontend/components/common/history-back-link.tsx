"use client"

import type { MouseEvent } from "react"
import { useRouter } from "next/navigation"
import { BackLink } from "@/components/common/back-link"

// A page reachable from anywhere — in-app links, a share, a redirect from the mobile app — can't
// know where "back" is at render time, so it decides on click: step back if this tab has a
// history to step through, otherwise go home. The href keeps it a real link for the no-script case.
export function HistoryBackLink() {
  const router = useRouter()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (window.history.length > 1) router.back()
    else router.push("/")
  }

  return <BackLink href="/" label="Back" onClick={handleClick} />
}
