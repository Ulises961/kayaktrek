import { notFound } from "next/navigation"
import { apiGet } from "@/lib/api/client"
import { ItemsSchema } from "@/lib/dtos/item"
import { PersonalPackingItemsSchema } from "@/lib/dtos/personal-packing"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { ItemsTab } from "@/components/trips/tabs/items-tab"

export default async function TripItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { isMember } = deriveMembership(trip, session)

  const [itemsResult, packingResult] = await Promise.allSettled([
    isMember
      ? apiGet("/api/item/all")
          .then((raw) => ItemsSchema.parse(raw))
          .catch(() => [])
      : Promise.resolve([]),
    isMember
      ? apiGet(`/api/packing/trip/${id}`)
          .then((raw) => PersonalPackingItemsSchema.parse(raw))
          .catch(() => [])
      : Promise.resolve([]),
  ])
  const myItems = itemsResult.status === "fulfilled" ? itemsResult.value : []
  const packingItems = packingResult.status === "fulfilled" ? packingResult.value : []

  return (
    <ItemsTab
      tripId={id}
      inventory={trip.inventory}
      isMember={isMember}
      myItems={myItems}
      packingItems={packingItems}
      currentUserId={session?.userId}
    />
  )
}
