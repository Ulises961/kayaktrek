import { apiGet } from "@/lib/api/client"
import { ItinerariesSchema } from "@/lib/dtos/itinerary"
import { MapPinIcon } from "lucide-react"
import Link from "next/link"
import { NewItineraryButton } from "@/components/itinerary/new-itinerary-button"

export default async function ItineraryListPage() {
  let itineraries: Awaited<ReturnType<typeof ItinerariesSchema.parse>> = []
  try {
    const raw = await apiGet<unknown[]>("/api/itinerary/all")
    itineraries = ItinerariesSchema.parse(raw)
  } catch {
    itineraries = []
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Itineraries</h1>
        <NewItineraryButton />
      </div>
      {itineraries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <MapPinIcon className="size-10 opacity-30" />
          <p className="text-sm">No itineraries yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {itineraries.map((itinerary) => {
            const numberedDays = (itinerary.days ?? []).filter((d) => d.dayNumber > 0)
            return (
              <Link key={itinerary.id} href={`/itinerary/${itinerary.id}`}>
                <div className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors cursor-pointer">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium truncate">
                      {itinerary.name || "Unnamed itinerary"}
                    </h2>
                    {itinerary.isPublic && (
                      <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                        Public
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                    {numberedDays.length > 0 && (
                      <span>
                        {numberedDays.length} day{numberedDays.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {itinerary.totalMiles != null && itinerary.totalMiles > 0 && (
                      <span>{itinerary.totalMiles.toFixed(1)} nm</span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
