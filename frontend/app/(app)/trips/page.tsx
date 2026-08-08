import { getSession } from "@/lib/auth/session"
import { listTrips } from "@/lib/trips/actions"
import { TRIP_STATE, TRIP_SORT } from "@/lib/dtos/trip"
import { TripsBoard } from "@/components/trips/trips-board"
import { NewTripDialog } from "@/components/trips/new-trip-dialog"
import { PageHeading } from "@/components/common/page-heading"
import { EmptyState } from "@/components/common/empty-state"
import { KayakIcon } from "lucide-react"
import { redirect } from "next/navigation"

export default async function Page() {
  const session = await getSession()
  if (!session) redirect("/login")

  // One page-1 fetch per state bucket, in parallel — replaces the old
  // apiGetAllPages call that eagerly fetched every page of every trip up
  // front regardless of how many a user has. Each TripsSection below takes it
  // from here with its own independent load-more (M12 §24 follow-up).
  const [happening, planning, past] = await Promise.all([
    listTrips({ state: TRIP_STATE.HAPPENING, sort: TRIP_SORT.LATEST_END }),
    listTrips({ state: TRIP_STATE.BUILDING, sort: TRIP_SORT.SOONEST }),
    listTrips({ state: TRIP_STATE.PAST, sort: TRIP_SORT.LATEST_END }),
  ])
  const grandTotal = happening.total + planning.total + past.total

  return (
    <>
      <div className="flex items-center justify-between">
        <PageHeading>Trips</PageHeading>
        <NewTripDialog />
      </div>
      {grandTotal === 0 ? (
        <EmptyState
          icon={KayakIcon}
          title="No trips yet"
          description="An expedition holds your route, crew, gear and float plan in one place. Use New trip above to get started."
        />
      ) : (
        <TripsBoard initialHappening={happening} initialPlanning={planning} initialPast={past} />
      )}
    </>
  )
}
