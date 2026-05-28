import { apiGet } from "@/lib/api/client"
import { ItinerariesSchema } from "@/lib/dtos/itinerary"
import { MapPinIcon } from "lucide-react"
import { NewItineraryButton } from "@/components/itinerary/new-itinerary-button"
import { ItineraryCard } from "@/components/itinerary/itinerary-card"

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
          {itineraries.map((itinerary) => (
            <ItineraryCard key={itinerary.id} itinerary={itinerary} />
          ))}
        </div>
      )}
    </div>
  )
}
