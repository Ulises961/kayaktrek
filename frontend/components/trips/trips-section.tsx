"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { TripCard } from "@/components/common/trip-card"
import { listTrips, type TripListFilters } from "@/lib/trips/actions"
import { TRIP_SORT, type Trip, type TripPage, type TripSort, type TripState } from "@/lib/dtos/trip"
import { extractItineraryRoute } from "@/lib/itinerary/public-routes"

// Derived from data already in hand — no extra fetch. Each Trip's envelope
// nests its full itinerary (days+points), including trips loaded later via
// "Load more", so this can't be precomputed server-side the way the old
// apiGetAllPages-based page did.
function tripRoute(trip: Trip) {
  if (!trip.itinerary) return null
  const route = extractItineraryRoute(trip.itinerary)
  return route.positions.length > 0 ? route : null
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs font-semibold tracking-[0.06em] uppercase">
        {label}
      </span>
      <span className="text-muted-foreground/50 text-xs">{count}</span>
    </div>
  )
}

interface TripsSectionProps {
  label: string
  state: TripState
  initial: TripPage
  /** Fixed sort when no dropdown is offered (Happening/Past); the Planning
   * section's initial value otherwise. */
  defaultSort: TripSort
  /** Present only on the Planning section — Happening/Past have no user-facing
   * sort control, just a fixed `defaultSort`. */
  sortOptions?: { value: TripSort; label: string }[]
  /** Shared across all three sections, owned by the trips page's filter bar —
   * a change here refetches this section's page 1, same as a sort change. */
  filters: Pick<TripListFilters, "difficulty" | "minMiles" | "maxMiles">
  hero?: boolean
  /** Reports whether this section has any results, so the page can tell "no
   * trips at all" apart from "no trips match the current filters." */
  onEmptyChange?: (empty: boolean) => void
}

// One independently-paginated, load-more trip listing bucketed by state —
// mirrors LogsList's fetch/sort/load-more shape (M12 §24 follow-up) so trips
// stop eagerly fetching every page up front via apiGetAllPages.
export function TripsSection({
  label,
  state,
  initial,
  defaultSort,
  sortOptions,
  filters,
  hero = false,
  onEmptyChange,
}: TripsSectionProps) {
  const [items, setItems] = useState<Trip[]>(initial.items)
  const [page, setPage] = useState(initial.page)
  const [pages, setPages] = useState(initial.pages)
  const [total, setTotal] = useState(initial.total)
  const [syncedInitial, setSyncedInitial] = useState(initial)
  const [sort, setSort] = useState<TripSort>(defaultSort)
  const [isPending, startTransition] = useTransition()
  const latestRequest = useRef(0)

  // Same prop-resync as LogsList: a child mutation revalidates the page and
  // hands this already-mounted section a fresh `initial`. Adjusted during render
  // so no stale frame is committed first.
  if (initial !== syncedInitial) {
    setSyncedInitial(initial)
    setItems(initial.items)
    setPage(initial.page)
    setPages(initial.pages)
    setTotal(initial.total)
  }

  // `onEmptyChange` is a fresh closure from the parent on every render (it
  // captures which state bucket it's reporting for) — only `total` actually
  // changing should re-fire this, not the parent re-rendering.
  useEffect(() => {
    onEmptyChange?.(total === 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total])

  // Refetch page 1 whenever sort or the shared filters change. Skips the very
  // first run — the server already provided `initial` for the unfiltered,
  // default-sort view.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const requestId = ++latestRequest.current
    startTransition(async () => {
      const result = await listTrips({ state, sort, page: 1, ...filters })
      if (requestId !== latestRequest.current) return
      setItems(result.items)
      setPage(result.page)
      setPages(result.pages)
      setTotal(result.total)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, filters.difficulty, filters.minMiles, filters.maxMiles])

  function loadMore() {
    if (page >= pages || isPending) return
    const requestId = ++latestRequest.current
    startTransition(async () => {
      const result = await listTrips({ state, sort, page: page + 1, ...filters })
      if (requestId !== latestRequest.current) return
      setItems((prev) => [...prev, ...result.items])
      setPage(result.page)
      setPages(result.pages)
      setTotal(result.total)
    })
  }

  if (total === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionHeader label={label} count={total} />
        {sortOptions && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as TripSort)}
            aria-label="Sort trips"
            className="border-border bg-background rounded-md border px-2 py-1 text-xs"
          >
            {sortOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((trip) => (
          <TripCard key={trip.id} trip={trip} hero={hero} route={tripRoute(trip)} />
        ))}
      </div>
      {page < pages && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-xs"
          disabled={isPending}
          onClick={loadMore}
        >
          {isPending ? "Loading…" : "Load more"}
        </Button>
      )}
    </section>
  )
}

export const PLANNING_SORT_OPTIONS: { value: TripSort; label: string }[] = [
  { value: TRIP_SORT.SOONEST, label: "Soonest first" },
  { value: TRIP_SORT.LATEST, label: "Latest first" },
]
