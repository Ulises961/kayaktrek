"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ctaEchoClass } from "@/components/common/button-roles"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { RouteThumbnail } from "@/components/common/route-thumbnail"
import { ListFilterPopover } from "@/components/common/list-filter-popover"
import { cn } from "@/lib/utils"
import { useDebouncedValue } from "@/lib/utils/debounce"
import {
  searchPublicItineraries,
  fetchPublicRouteData,
  forkItinerary,
} from "@/lib/itinerary/actions"
import type {
  ExploreItem,
  ExplorePage,
  ExploreFilters,
  ExploreBounds,
  ExploreSort,
} from "@/lib/dtos/itinerary"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { DISTANCE_UNIT, formatDistance, type DistanceUnit } from "@/lib/itinerary/distance"
import { SeasonBadge } from "./season-badge"
import { RouteSignals } from "./route-signals"
import { DifficultyBadge } from "@/components/common/difficulty-badge"
import { EmptyState } from "@/components/common/empty-state"

const ExploreDiscoveryMap = dynamic(() => import("./explore-discovery-map"), { ssr: false })

const SEASONS = ["winter", "spring", "summer", "autumn"] as const
const SORTS: { value: ExploreSort; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
  { value: "name", label: "Name" },
]

type Props = {
  initial: ExplorePage
  isAuthenticated: boolean
  ownedIds: string[]
  unit?: DistanceUnit
  // The anonymous root renders this same surface as the product's chart; /explore inside
  // the app shell renders it as a tool. Only the map's furniture differs.
  chartFurniture?: boolean
}

function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

// The card banner only needs a polyline — the backend supplies simplified
// previewPositions on every listing row precisely so this never has to fetch
// the full RouteData per card (M12 §E).
function previewRoute(item: ExploreItem): RouteData {
  return {
    id: item.id,
    name: item.name ?? "Untitled",
    positions: item.previewPositions,
    days: [],
    boundaryColors: {},
    totalMiles: item.totalMiles ?? null,
    dayCount: item.dayCount,
  }
}

export function ExploreDiscovery({
  initial,
  isAuthenticated,
  ownedIds,
  unit = DISTANCE_UNIT.NM,
  chartFurniture = false,
}: Props) {
  const router = useRouter()
  const [isForking, startFork] = useTransition()
  const owned = new Set(ownedIds)

  // Filter inputs
  const [name, setName] = useState("")
  const debouncedName = useDebouncedValue(name, 300)
  const [seasons, setSeasons] = useState<string[]>([])
  const [minMiles, setMinMiles] = useState("")
  const [maxMiles, setMaxMiles] = useState("")
  const [minDays, setMinDays] = useState("")
  const [maxDays, setMaxDays] = useState("")
  const [sort, setSort] = useState<ExploreSort>("recent")
  const [boundsEnabled, setBoundsEnabled] = useState(false)
  const [bbox, setBbox] = useState<ExploreBounds | null>(null)

  // Results
  const [items, setItems] = useState<ExploreItem[]>(initial.items)
  const [page, setPage] = useState(initial.page)
  const [pages, setPages] = useState(initial.pages)
  const [total, setTotal] = useState(initial.total)
  const [isSearching, startSearch] = useTransition()
  const latestRequest = useRef(0)

  // Selection (lazily-fetched polyline for the highlighted route)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<RouteData | null>(null)
  const routeCache = useRef<Map<string, RouteData | null>>(new Map())

  const buildFilters = useCallback(
    (targetPage: number): ExploreFilters => ({
      name: debouncedName,
      seasons,
      minMiles: toNumber(minMiles),
      maxMiles: toNumber(maxMiles),
      minDays: toNumber(minDays),
      maxDays: toNumber(maxDays),
      bbox: boundsEnabled ? (bbox ?? undefined) : undefined,
      sort,
      page: targetPage,
    }),
    [debouncedName, seasons, minMiles, maxMiles, minDays, maxDays, boundsEnabled, bbox, sort],
  )

  // Refetch page 1 whenever a filter changes. Skip the very first run — the server
  // already provided `initial`. The search runs inside a transition (deferred) so we
  // never call setState synchronously in the effect body; a request id discards stale
  // responses that resolve out of order.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const requestId = ++latestRequest.current
    startSearch(async () => {
      const result = await searchPublicItineraries(buildFilters(1))
      if (requestId !== latestRequest.current) return
      setItems(result.items)
      setPage(result.page)
      setPages(result.pages)
      setTotal(result.total)
    })
  }, [buildFilters])

  function loadMore() {
    if (page >= pages || isSearching) return
    const requestId = ++latestRequest.current
    startSearch(async () => {
      const result = await searchPublicItineraries(buildFilters(page + 1))
      if (requestId !== latestRequest.current) return
      setItems((prev) => [...prev, ...result.items])
      setPage(result.page)
      setPages(result.pages)
      setTotal(result.total)
    })
  }

  const select = useCallback(async (id: string) => {
    setSelectedId(id)
    if (routeCache.current.has(id)) {
      setSelectedRoute(routeCache.current.get(id) ?? null)
      return
    }
    const route = await fetchPublicRouteData(id)
    routeCache.current.set(id, route)
    setSelectedRoute(route)
  }, [])

  function toggleSeason(season: string) {
    setSeasons((prev) =>
      prev.includes(season) ? prev.filter((s) => s !== season) : [...prev, season],
    )
  }

  const seasonsFilterActive = seasons.length > 0
  const milesFilterActive = minMiles.trim() !== "" || maxMiles.trim() !== ""
  const daysFilterActive = minDays.trim() !== "" || maxDays.trim() !== ""
  const activeFilterCount =
    (seasonsFilterActive ? 1 : 0) +
    (milesFilterActive ? 1 : 0) +
    (daysFilterActive ? 1 : 0) +
    (boundsEnabled ? 1 : 0)

  function clearFilters() {
    setSeasons([])
    setMinMiles("")
    setMaxMiles("")
    setMinDays("")
    setMaxDays("")
    setBoundsEnabled(false)
  }

  function handleFork(id: string) {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    startFork(async () => {
      const result = await forkItinerary(id)
      if (result.success) {
        router.push(`/itinerary/${result.itineraryId}`)
        return
      }
      toast.error(result.error)
    })
  }

  return (
    <div className="flex flex-col xl:h-full xl:flex-row">
      {/* Map panel — hidden below `xl`. On a phone the route cards, each carrying their
          own thumbnail, are the whole point; a squeezed map above them was pure scroll
          cost with no affordance the thumbnails don't already give. It reappears exactly
          where the layout goes side-by-side, so there's no half-state where it's on
          screen but too short to be useful. */}
      <div className="hidden xl:block xl:h-full xl:max-h-none xl:min-w-0 xl:flex-1">
        <ExploreDiscoveryMap
          items={items}
          selectedId={selectedId}
          selectedRoute={selectedRoute}
          boundsEnabled={boundsEnabled}
          onSelect={select}
          onBoundsChange={setBbox}
          chartFurniture={chartFurniture}
        />
      </div>

      {/* Filters + results */}
      <div className="border-border bg-background flex flex-col border-t xl:w-96 xl:shrink-0 xl:border-t-0 xl:border-l">
        {/* Filter controls */}
        <div className="border-border flex flex-col gap-3 border-b p-3">
          <Input
            placeholder="Search routes by name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Search routes by name"
          />
          <div className="flex items-center justify-between gap-2">
            <ListFilterPopover activeCount={activeFilterCount} onClear={clearFilters}>
              <div className="flex flex-wrap gap-1.5">
                {SEASONS.map((season) => (
                  <button
                    key={season}
                    type="button"
                    onClick={() => toggleSeason(season)}
                    aria-pressed={seasons.includes(season)}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
                      // An engaged filter is structure, not a raw Tailwind sky — it says
                      // "this is on", the same thing a selected nav item says.
                      seasons.includes(season)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {season}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Min nm</span>
                  <Input
                    type="number"
                    value={minMiles}
                    onChange={(e) => setMinMiles(e.target.value)}
                    aria-label="Minimum distance"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Max nm</span>
                  <Input
                    type="number"
                    value={maxMiles}
                    onChange={(e) => setMaxMiles(e.target.value)}
                    aria-label="Maximum distance"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Min days</span>
                  <Input
                    type="number"
                    value={minDays}
                    onChange={(e) => setMinDays(e.target.value)}
                    aria-label="Minimum days"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">Max days</span>
                  <Input
                    type="number"
                    value={maxDays}
                    onChange={(e) => setMaxDays(e.target.value)}
                    aria-label="Maximum days"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="bounds"
                  checked={boundsEnabled}
                  onCheckedChange={(v) => setBoundsEnabled(!!v)}
                />
                <Label htmlFor="bounds" className="text-xs">
                  Filter to map area
                </Label>
              </div>
            </ListFilterPopover>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ExploreSort)}
              aria-label="Sort routes"
              className="border-border bg-background rounded-md border px-2 py-1 text-xs"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Result cards */}
        <div className="flex flex-col gap-2 p-3 xl:flex-1 xl:overflow-y-auto">
          <p className="text-muted-foreground text-xs">
            {total === 0 ? "No routes match" : `${total} ${total === 1 ? "route" : "routes"}`}
          </p>
          {items.length === 0 && !isSearching ? (
            // Two different emptinesses, and telling them apart matters most on the
            // anonymous root, where this is a visitor's first impression. "Widen the
            // search" is actively misleading when the library itself is empty and no
            // filter is on — there is nothing to widen towards. Cold start gets an
            // invitation instead; a filtered miss keeps the advice that helps.
            //
            // Filter-driven either way, so no ghost rows: the panel is warranted at this
            // size, the promise that content will arrive on its own is not.
            activeFilterCount === 0 && debouncedName.trim() === "" ? (
              <EmptyState
                className="m-4"
                title="No routes have been shared yet."
                description="This library is built by the people who paddle it. Publish a route you know and it will show up here."
                ghostRows={0}
              />
            ) : (
              <EmptyState
                className="m-4"
                title="No public routes match these filters."
                description="Widen the search, or clear a filter to see the full library."
                ghostRows={0}
              />
            )
          ) : (
            items.map((item) => (
              <Card
                key={item.id}
                // Selected is a filled tint, not a ring. A ring wrapped the card and ran
                // into the chart rule across its top, and it was `ring-sky-400` — a raw
                // Tailwind literal, which is why selected never quite matched the hover
                // beside it. Both now come from the same token, one step apart.
                className={cn(
                  "relative isolate shrink-0 gap-0 overflow-hidden rounded-lg py-0 transition-colors",
                  selectedId === item.id ? "bg-accent" : "hover:bg-accent/60",
                )}
                onMouseEnter={() => select(item.id)}
              >
                {item.previewPositions.length > 1 && (
                  // The thumbnail is part of the same click target as the title below —
                  // a picture that does nothing when tapped reads as decoration, and the
                  // "Use this route" button right underneath was winning every click that
                  // was actually aimed at opening the route.
                  <Link href={`/routes/${item.id}`} className="block">
                    <RouteThumbnail route={previewRoute(item)} className="h-20 sm:h-24" />
                  </Link>
                )}
                <div className="flex flex-col gap-2 p-3 pt-1.5">
                  <div className="flex items-start justify-between gap-2">
                    {/* `text-primary` year-round, not just on hover — the button below
                        already reads as an action; the title needs to read as a
                        destination without a visitor having to find out by hovering. */}
                    <Link
                      href={`/routes/${item.id}`}
                      className="text-primary text-sm leading-tight font-medium hover:underline"
                    >
                      {item.name ?? "Untitled"}
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <DifficultyBadge difficulty={item.difficulty} />
                      <SeasonBadge season={item.season} />
                    </div>
                  </div>
                  <div className="text-muted-foreground flex gap-3 text-xs">
                    {item.totalMiles != null && (
                      <span>
                        {formatDistance(item.totalMiles, unit)} {unit}
                      </span>
                    )}
                    {item.dayCount > 0 && (
                      <span>
                        {item.dayCount} {item.dayCount === 1 ? "day" : "days"}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    // Clamped, not hidden below `sm` — a phone is where the library is
                    // browsed, and unbounded prose is the real problem, not the width.
                    <p
                      data-testid="route-pitch"
                      className="text-muted-foreground line-clamp-2 text-xs"
                    >
                      {item.description}
                    </p>
                  )}
                  <RouteSignals item={item} unit={unit} />
                  {item.originalAuthor && (
                    <p className="text-muted-foreground text-xs">
                      Cloned from{" "}
                      {item.originalAuthor.linkable ? (
                        <Link
                          href={`/paddlers/${item.originalAuthor.username}`}
                          className="font-medium hover:underline"
                        >
                          {item.originalAuthor.name ?? item.originalAuthor.username}
                        </Link>
                      ) : (
                        <span className="font-medium">
                          {item.originalAuthor.name ?? item.originalAuthor.username}
                        </span>
                      )}
                    </p>
                  )}
                  {owned.has(item.id) ? (
                    // The viewer authored this route — open the original, don't clone it.
                    // No amber, and that is the rule working rather than an oversight:
                    // opening something you already have brings nothing into existence.
                    //
                    // It does need its own hover, though. The default outline hover is
                    // `bg-accent`, which is exactly the surface a *selected* card already
                    // sits on — so on the card the pointer is over, the button dissolved
                    // into its own background. Structure ink instead, legible on both.
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      // `border-transparent` at rest: the neutral outline made this the
                      // most defined shape on the card, ahead of the title it sits
                      // below. The border still appears, coloured, on hover — the outline
                      // variant is kept for its focus ring and hit-area padding, not its
                      // rest-state border.
                      className="hover:border-primary hover:text-primary h-7 w-full border-transparent text-xs hover:bg-transparent"
                    >
                      <Link href={`/itinerary/${item.id}`}>Open your route</Link>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className={cn("h-7 w-full border-transparent text-xs", ctaEchoClass)}
                      disabled={isForking}
                      onClick={() => handleFork(item.id)}
                    >
                      Use this route
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
          {page < pages && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              disabled={isSearching}
              onClick={loadMore}
            >
              {isSearching ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
