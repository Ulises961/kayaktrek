import { apiGet, rethrowIfRedirect } from "@/lib/api/client"
import { ItinerariesSchema } from "@/lib/dtos/itinerary"
import { NewItineraryButton } from "@/components/itinerary/new-itinerary-button"
import { ImportGpxButton } from "@/components/itinerary/import-gpx-button"
import { ItineraryCard } from "@/components/itinerary/itinerary-card"
import { getMe } from "@/lib/user/me"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import { PageHeading } from "@/components/common/page-heading"
import { EmptyState } from "@/components/common/empty-state"
import { SignpostBigIcon } from "lucide-react"

export default async function ItineraryListPage() {
  let itineraries: Awaited<ReturnType<typeof ItinerariesSchema.parse>> = []
  try {
    const raw = await apiGet<unknown[]>("/api/itinerary/all")
    itineraries = ItinerariesSchema.parse(raw)
  } catch (error) {
    rethrowIfRedirect(error)
    itineraries = []
  }
  const me = await getMe()
  const unit = me?.unitPreference ?? DISTANCE_UNIT.NM

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <PageHeading>Itineraries</PageHeading>
        <div className="flex items-center gap-2">
          <ImportGpxButton />
          <NewItineraryButton />
        </div>
      </div>
      {itineraries.length === 0 ? (
        <EmptyState
          icon={SignpostBigIcon}
          title="No itineraries yet"
          description="Routes you plan on the map appear here — days, distances and stops, ready to attach to a trip."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {itineraries.map((itinerary) => (
            <ItineraryCard key={itinerary.id} itinerary={itinerary} unit={unit} />
          ))}
        </div>
      )}
    </>
  )
}
