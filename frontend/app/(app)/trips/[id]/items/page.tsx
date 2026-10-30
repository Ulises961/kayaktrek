import { notFound } from "next/navigation"
import { PackageIcon } from "lucide-react"
import { apiGet } from "@/lib/api/client"
import { ItemsSchema } from "@/lib/dtos/item"
import { ItemCategoriesSchema } from "@/lib/dtos/item-category"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { RequirementsChecklist } from "@/components/inventory/requirements-checklist"

// Group requirements sub-segment — the collaborative checklist. The private
// My kit moved to its own /items/kit segment (M12 §P).
export default async function TripItemsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { isMember } = deriveMembership(trip, session)

  // The contribute dropdown needs the member's own owned gear; the headings need the category
  // names behind the slugs the requirements store.
  const [myItems, categories] = await Promise.all([
    isMember
      ? apiGet("/api/item/all")
          .then((raw) => ItemsSchema.parse(raw))
          .catch(() => [])
      : [],
    apiGet("/api/item-categories")
      .then((raw) => ItemCategoriesSchema.parse(raw))
      .catch(() => []),
  ])

  return (
    <section className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <PackageIcon className="text-muted-foreground size-4" />
        Trip inventory
      </p>

      {trip.inventory ? (
        <RequirementsChecklist
          inventoryId={trip.inventory.id!}
          tripId={id}
          requirements={trip.inventory.requirements ?? []}
          categories={categories}
          myItems={myItems}
          canManage={isMember}
          currentUserId={session?.userId}
        />
      ) : (
        <p className="text-muted-foreground text-sm italic">
          This trip&rsquo;s inventory isn&rsquo;t available yet.
        </p>
      )}
    </section>
  )
}
