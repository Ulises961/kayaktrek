"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { MapIcon, MapPinIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createItinerary } from "@/lib/itinerary/actions"
import type { Itinerary } from "@/lib/dtos/itinerary"

interface ItineraryTabProps {
  tripId: string
  itinerary: Itinerary | null | undefined
  isLeader: boolean
}

export function ItineraryTab({ tripId, itinerary, isLeader }: ItineraryTabProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleCreate() {
    startTransition(async () => {
      await createItinerary({ tripId })
      router.refresh()
    })
  }

  if (!itinerary) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <MapPinIcon className="size-4 text-muted-foreground" />
          Itinerary
        </p>
        {isLeader ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto sm:self-start"
            disabled={isPending}
            onClick={handleCreate}
          >
            <MapIcon className="size-4 mr-2" />
            Create itinerary
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground italic">No itinerary yet.</p>
        )}
      </div>
    )
  }

  const days = itinerary.days ?? []
  const isDraft = days.length === 0

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium flex items-center gap-2">
        <MapPinIcon className="size-4 text-muted-foreground" />
        Itinerary
      </p>

      {isDraft ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Draft</span> — points dropped, no days assigned yet.
          </p>
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto sm:self-start">
            <Link href={`/itinerary/${itinerary.id}`}>
              <MapIcon className="size-4 mr-2" />
              Continue in map builder
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Days</p>
              <p className="font-medium">{days.length}</p>
            </div>
            {itinerary.totalMiles != null && itinerary.totalMiles > 0 && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Total miles</p>
                <p className="font-medium">{itinerary.totalMiles}</p>
              </div>
            )}
            {itinerary.expectedTotalMiles != null && (
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">Expected miles</p>
                <p className="font-medium">{itinerary.expectedTotalMiles}</p>
              </div>
            )}
          </div>
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto sm:self-start">
            <Link href={`/itinerary/${itinerary.id}`}>
              <MapIcon className="size-4 mr-2" />
              Open map builder
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}
