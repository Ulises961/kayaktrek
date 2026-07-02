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
    <div className="flex flex-col xl:h-full xl:flex-row">
      {/* Map panel — fixed height on mobile/md/lg, fills remaining space on xl+ */}
      <div className="h-[45vw] max-h-80 min-h-48 shrink-0 xl:h-full xl:max-h-none xl:min-w-0 xl:flex-1">
        <ExploreMap routes={routes} selectedId={selectedId} />
      </div>

      {/* Card list — flows below map up to xl, scrollable sidebar on xl+ */}
      <div className="border-border bg-background flex flex-col gap-2 border-t p-3 xl:w-80 xl:shrink-0 xl:overflow-y-auto xl:border-t-0 xl:border-l">
        {routes.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-3 py-16">
            <RouteIcon className="size-8 opacity-30" />
            <p className="text-center text-sm">No public itineraries yet.</p>
          </div>
        ) : (
          routes.map((route) => (
            <div
              key={route.id}
              className="border-border bg-card hover:bg-secondary flex flex-col gap-2 rounded-lg border p-3 transition-colors"
              onMouseEnter={() => setSelectedId(route.id)}
              onMouseLeave={() => setSelectedId(null)}
            >
              <p className="text-sm leading-tight font-medium">{route.name}</p>
              <div className="text-muted-foreground flex gap-3 text-xs">
                {route.totalMiles != null && <span>{route.totalMiles.toFixed(1)} nm</span>}
                {route.dayCount > 0 && (
                  <span>
                    {route.dayCount} {route.dayCount === 1 ? "day" : "days"}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs"
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
