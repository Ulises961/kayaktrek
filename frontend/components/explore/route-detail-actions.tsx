"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { forkItinerary } from "@/lib/itinerary/actions"

type Props = {
  itineraryId: string
  isAuthenticated: boolean
}

export function RouteDetailActions({ itineraryId, isAuthenticated }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleFork() {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    startTransition(async () => {
      const result = await forkItinerary(itineraryId)
      if (result.success) router.push(`/itinerary/${result.itineraryId}`)
    })
  }

  return (
    <Button onClick={handleFork} disabled={isPending}>
      {isAuthenticated ? "Use this route" : "Log in to use this route"}
    </Button>
  )
}
