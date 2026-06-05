import { apiGet } from "@/lib/api/client"
import { ItinerariesSchema } from "@/lib/dtos/itinerary"
import { MapPinIcon } from "lucide-react"
import { NewItineraryButton } from "@/components/itinerary/new-itinerary-button"
import { ImportGpxButton } from "@/components/itinerary/import-gpx-button"
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
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-semibold">Itineraries</h1>
        <div className="flex items-center gap-2">
          <ImportGpxButton />
          <NewItineraryButton />
        </div>
      </div>
      {itineraries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <MapPinIcon className="size-10 opacity-30" />
          <p className="text-sm">No itineraries yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-4">
          {itineraries.map((itinerary) => (
            <ItineraryCard key={itinerary.id} itinerary={itinerary} />
          ))}
        </div>
      )}
    </>
  )
}
