"use client"

import { useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { RouteIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { forkItinerary } from "@/lib/itinerary/actions"
import type { RouteData } from "@/lib/itinerary/public-routes"

const ExploreMap = dynamic(() => import("./explore-map"), { ssr: false })

type Props = {
  routes: RouteData[]
  isAuthenticated: boolean
}

export function ExploreClient({ routes, isAuthenticated }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleFork(id: string) {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    startTransition(async () => {
      const result = await forkItinerary(id)
      if (result.success) router.push(`/itinerary/${result.itineraryId}`)
    })
  }

  return (
    <div className="flex flex-col md:flex-row md:h-full">
      {/* Map panel — fixed height on mobile, fills remaining space on desktop */}
      <div className="h-[45vw] min-h-48 max-h-80 md:max-h-none md:h-full md:flex-1 md:min-w-0 shrink-0">
        <ExploreMap routes={routes} selectedId={selectedId} />
      </div>

      {/* Card list — flows below map on mobile, scrollable sidebar on desktop */}
      <div className="md:w-80 md:shrink-0 md:overflow-y-auto flex flex-col gap-2 p-3 border-t md:border-t-0 md:border-l border-border bg-background">
        {routes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <RouteIcon className="size-8 opacity-30" />
            <p className="text-sm text-center">No public itineraries yet.</p>
          </div>
        ) : (
          routes.map((route) => (
            <div
              key={route.id}
              className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2 transition-colors hover:bg-accent"
              onMouseEnter={() => setSelectedId(route.id)}
              onMouseLeave={() => setSelectedId(null)}
            >
              <p className="font-medium text-sm leading-tight">{route.name}</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                {route.totalMiles != null && (
                  <span>{route.totalMiles.toFixed(1)} nm</span>
                )}
                {route.dayCount > 0 && (
                  <span>{route.dayCount} {route.dayCount === 1 ? "day" : "days"}</span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs h-7"
                disabled={isPending}
                onClick={() => handleFork(route.id)}
              >
                Use this route
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
