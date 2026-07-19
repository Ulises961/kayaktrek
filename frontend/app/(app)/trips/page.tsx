import { getSession } from "@/lib/auth/session"
import { listTrips } from "@/lib/trips/actions"
import { TRIP_STATE, TRIP_SORT } from "@/lib/dtos/trip"
import { TripsBoard } from "@/components/trips/trips-board"
import { NewTripDialog } from "@/components/trips/new-trip-dialog"
import { StateVisual } from "@/components/illustrations/state-visual"
import CurrentPageTitle from "@/components/common/current-page-title"
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
      <div className="mb-4 flex items-center justify-between">
        <CurrentPageTitle />
        <NewTripDialog />
      </div>
      {grandTotal === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-6 text-center xl:mt-24">
          <StateVisual state="empty" className="3xl:w-[32rem] w-56 opacity-80 xl:w-80 2xl:w-96" />
          <p className="text-muted-foreground text-sm xl:text-base 2xl:text-lg">
            No trips yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <TripsBoard initialHappening={happening} initialPlanning={planning} initialPast={past} />
        </div>
      )}
    </>
  )
}
