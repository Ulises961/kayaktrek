"use client"

import { useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { forkItinerary } from "@/lib/itinerary/actions"

type Props = {
  itineraryId: string
  isAuthenticated: boolean
  isOwner: boolean
}

export function RouteDetailActions({ itineraryId, isAuthenticated, isOwner }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // The author already owns this route — open the original rather than clone a duplicate.
  if (isOwner) {
    return (
      <Button asChild>
        <Link href={`/itinerary/${itineraryId}`}>Open your route</Link>
      </Button>
    )
  }

  function handleFork() {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    startTransition(async () => {
      const result = await forkItinerary(itineraryId)
      if (result.success) {
        router.push(`/itinerary/${result.itineraryId}`)
        return
      }
      toast.error(result.error)
    })
  }

  return (
    <Button onClick={handleFork} disabled={isPending} className={ctaButtonClass}>
      {isAuthenticated ? "Use this route" : "Log in to use this route"}
    </Button>
  )
}
