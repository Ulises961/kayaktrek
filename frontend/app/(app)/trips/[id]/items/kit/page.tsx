import { notFound, redirect } from "next/navigation"
import { BackpackIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { ItemsSchema } from "@/lib/dtos/item"
import { PersonalPackingItemsSchema } from "@/lib/dtos/personal-packing"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { PersonalPacking } from "@/components/inventory/personal-packing"

// My kit sub-segment (M12 §P) — the member's private per-trip packing list.
// Non-members have no kit here: the nav never links them in, and a direct URL
// lands back on the requirements segment.
export default async function TripKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { isMember } = deriveMembership(trip, session)
  if (!isMember) redirect(`/trips/${id}/items`)

  const [myItems, packingItems] = await Promise.all([
    apiGet("/api/item/all")
      .then((raw) => ItemsSchema.parse(raw))
      .catch(() => []),
    apiGet(`/api/packing/trip/${id}`)
      .then((raw) => PersonalPackingItemsSchema.parse(raw))
      .catch(() => []),
  ])

  return (
    <section className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <BackpackIcon className="text-muted-foreground size-4" />
        My kit
        <span className="text-muted-foreground text-xs font-normal">· private to you</span>
      </p>
      <PersonalPacking tripId={id} packingItems={packingItems} myItems={myItems} />
    </section>
  )
}
