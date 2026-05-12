import { MapPinIcon } from "lucide-react"

export function ItineraryTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <MapPinIcon className="size-4 text-muted-foreground" />
        Itinerary
      </p>
      <p className="text-sm text-muted-foreground italic">
        Map-first itinerary builder coming in M4.
      </p>
    </div>
  )
}
