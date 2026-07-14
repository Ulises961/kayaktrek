"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { RouteIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { CardTopRule } from "@/components/common/card-top-rule"
import { RouteThumbnail } from "@/components/common/route-thumbnail"
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
import { SeasonBadge } from "./season-badge"

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

export function ExploreDiscovery({ initial, isAuthenticated, ownedIds }: Props) {
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

  function handleFork(id: string) {
    if (!isAuthenticated) {
      router.push("/login")
      return
    }
    startFork(async () => {
      const result = await forkItinerary(id)
      if (result.success) router.push(`/itinerary/${result.itineraryId}`)
    })
  }

  return (
    <div className="flex flex-col xl:h-full xl:flex-row">
      {/* Map panel */}
      <div className="h-[45vw] max-h-80 min-h-48 shrink-0 xl:h-full xl:max-h-none xl:min-w-0 xl:flex-1">
        <ExploreDiscoveryMap
          items={items}
          selectedId={selectedId}
          selectedRoute={selectedRoute}
          boundsEnabled={boundsEnabled}
          onSelect={select}
          onBoundsChange={setBbox}
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
          <div className="flex flex-wrap gap-1.5">
            {SEASONS.map((season) => (
              <button
                key={season}
                type="button"
                onClick={() => toggleSeason(season)}
                aria-pressed={seasons.includes(season)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
                  seasons.includes(season)
                    ? "border-sky-500 bg-sky-500 text-white"
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
          <div className="flex items-center justify-between gap-2">
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
            <div className="text-muted-foreground flex flex-col items-center gap-3 py-16">
              <RouteIcon className="size-8 opacity-30" />
              <p className="text-center text-sm">No public routes match these filters.</p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "border-border bg-card relative flex flex-col gap-2 overflow-hidden rounded-lg border transition-colors",
                  selectedId === item.id ? "ring-2 ring-sky-400" : "hover:bg-accent",
                )}
                onMouseEnter={() => select(item.id)}
              >
                <CardTopRule className="absolute inset-x-0 top-0 z-[1002]" />
                {item.previewPositions.length > 1 && (
                  <RouteThumbnail route={previewRoute(item)} className="h-20 sm:h-24" />
                )}
                <div className="flex flex-col gap-2 p-3 pt-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/routes/${item.id}`}
                      className="text-sm leading-tight font-medium hover:underline"
                    >
                      {item.name ?? "Untitled"}
                    </Link>
                    <SeasonBadge season={item.season} />
                  </div>
                  <div className="text-muted-foreground flex gap-3 text-xs">
                    {item.totalMiles != null && <span>{item.totalMiles.toFixed(1)} nm</span>}
                    {item.dayCount > 0 && (
                      <span>
                        {item.dayCount} {item.dayCount === 1 ? "day" : "days"}
                      </span>
                    )}
                  </div>
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
                    <Button asChild size="sm" variant="outline" className="h-7 w-full text-xs">
                      <Link href={`/itinerary/${item.id}`}>Open your route</Link>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full text-xs"
                      disabled={isForking}
                      onClick={() => handleFork(item.id)}
                    >
                      Use this route
                    </Button>
                  )}
                </div>
              </div>
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
