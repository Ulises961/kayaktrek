import { notFound } from "next/navigation"
import type { ReactNode } from "react"
import { getTripCore } from "@/lib/trips/core"
import { getSession } from "@/lib/auth/session"
import { deriveMembership } from "@/lib/trips/membership"
import { ItemsNav } from "@/components/inventory/items-nav"

// Shared shell for the Items area's two sub-segments (M12 §P): group
// requirements (/items) and the private My kit (/items/kit, members only —
// non-members get no kit tab and the kit page itself re-checks membership).
export default async function TripItemsLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const trip = await getTripCore(id)
  if (!trip) notFound()

  const session = await getSession()
  const { isMember } = deriveMembership(trip, session)

  return (
    <div className="flex flex-col gap-4">
      <ItemsNav tripId={id} showKit={isMember} />
      {children}
    </div>
  )
}
