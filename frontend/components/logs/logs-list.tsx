"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ListRow } from "@/components/common/list-row"
import { ListFilterPopover } from "@/components/common/list-filter-popover"
import { listMyLogs, listEndorsedLogs, type LogListFilters } from "@/lib/logs/actions"
import { LogCard } from "./log-card"
import { LOG_SORT, type Log, type LogPage, type LogSort } from "@/lib/dtos/log"
import type { DistanceUnit } from "@/lib/itinerary/distance"
import { EmptyState } from "@/components/common/empty-state"
import { NewspaperIcon } from "lucide-react"

const SORTS: { value: LogSort; label: string }[] = [
  { value: LOG_SORT.NEWEST, label: "Newest first" },
  { value: LOG_SORT.OLDEST, label: "Oldest first" },
]

// Beaufort scale bounds — the Log.avgSea domain (backend `Services/log_service.py`
// validates 0-12). A slider fits this filter well precisely because the domain is
// small, fixed, and known, unlike distance which has no natural ceiling.
const SEA_MIN = 0
const SEA_MAX = 12

function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

interface LogsListProps {
  initial: LogPage
  kind: "mine" | "endorsed"
  currentUserId?: string
  unit?: DistanceUnit
}

export function LogsList({ initial, kind, currentUserId, unit }: LogsListProps) {
  const [items, setItems] = useState<Log[]>(initial.items)
  const [page, setPage] = useState(initial.page)
  const [pages, setPages] = useState(initial.pages)
  const [sort, setSort] = useState<LogSort>(LOG_SORT.NEWEST)
  const [seaRange, setSeaRange] = useState<[number, number]>([SEA_MIN, SEA_MAX])
  const [minDistance, setMinDistance] = useState("")
  const [maxDistance, setMaxDistance] = useState("")
  const [isPending, startTransition] = useTransition()
  const latestRequest = useRef(0)

  const fetchPage = kind === "mine" ? listMyLogs : listEndorsedLogs

  const filters: LogListFilters = {
    minSea: seaRange[0] > SEA_MIN ? seaRange[0] : undefined,
    maxSea: seaRange[1] < SEA_MAX ? seaRange[1] : undefined,
    minDistance: toNumber(minDistance),
    maxDistance: toNumber(maxDistance),
  }
  const seaFilterActive = filters.minSea != null || filters.maxSea != null
  const distanceFilterActive = filters.minDistance != null || filters.maxDistance != null
  const activeFilterCount = (seaFilterActive ? 1 : 0) + (distanceFilterActive ? 1 : 0)

  function clearFilters() {
    setSeaRange([SEA_MIN, SEA_MAX])
    setMinDistance("")
    setMaxDistance("")
  }

  // A mutation from a child (add/edit/delete) revalidates `/logs` server-side; Next
  // then re-renders this already-mounted component with a fresh `initial` object.
  // `items`/`page`/`pages` are local state seeded from `initial` (needed for sort
  // refetch + load-more accumulation below), so they don't pick that up on their
  // own — resync whenever `initial` itself changes.
  useEffect(() => {
    setItems(initial.items)
    setPage(initial.page)
    setPages(initial.pages)
  }, [initial])

  // Refetch page 1 whenever sort or a severity/distance filter changes. Skip the
  // very first run — the server already provided `initial`. A request id
  // discards stale responses that resolve out of order (mirrors
  // ExploreDiscovery's pattern).
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const requestId = ++latestRequest.current
    startTransition(async () => {
      const result = await fetchPage(1, sort, filters)
      if (requestId !== latestRequest.current) return
      setItems(result.items)
      setPage(result.page)
      setPages(result.pages)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, filters.minSea, filters.maxSea, filters.minDistance, filters.maxDistance])

  function loadMore() {
    if (page >= pages || isPending) return
    const requestId = ++latestRequest.current
    startTransition(async () => {
      const result = await fetchPage(page + 1, sort, filters)
      if (requestId !== latestRequest.current) return
      setItems((prev) => [...prev, ...result.items])
      setPage(result.page)
      setPages(result.pages)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <ListFilterPopover activeCount={activeFilterCount} onClear={clearFilters}>
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium">Sea state (Beaufort)</span>
            <Slider
              min={SEA_MIN}
              max={SEA_MAX}
              step={1}
              value={seaRange}
              onValueChange={(v) => setSeaRange(v as [number, number])}
              aria-label="Sea state range"
            />
            <div className="text-muted-foreground flex justify-between text-[11px] tabular-nums">
              <span>{seaRange[0]}</span>
              <span>{seaRange[1]}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Min distance</span>
              <Input
                type="number"
                value={minDistance}
                onChange={(e) => setMinDistance(e.target.value)}
                aria-label="Minimum distance"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">Max distance</span>
              <Input
                type="number"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
                aria-label="Maximum distance"
              />
            </label>
          </div>
        </ListFilterPopover>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as LogSort)}
          aria-label={kind === "mine" ? "Sort my logs" : "Sort endorsed logs"}
          className="border-border bg-background rounded-md border px-2 py-1 text-xs"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        // A filter miss is transient and the logs do exist — plain line. Having
        // none at all is the empty state.
        activeFilterCount > 0 ? (
          <EmptyState variant="inline" title="No logs match these filters." />
        ) : kind === "mine" ? (
          <EmptyState
            icon={NewspaperIcon}
            title="No logs yet"
            description="Record a paddle and it lands here with its distance, conditions and anyone who was on the water with you."
          />
        ) : (
          <EmptyState
            icon={NewspaperIcon}
            title="No endorsed logs yet"
            description="Logs that paddlers from the same trip vouch for appear here, building a record others can trust."
          />
        )
      ) : (
        // LogCard stays a full Card (it carries endorsers/actions) — only the
        // inter-card separation adopts the shared hairline language (M12 §O)
        // instead of whitespace-only gaps.
        <div className="flex flex-col">
          {items.map((log) => (
            <ListRow as="div" key={log.id} className="py-2 first:pt-0">
              <LogCard
                log={log}
                variant={kind === "endorsed" ? "endorsed" : "owner"}
                currentUserId={currentUserId}
                unit={unit}
              />
            </ListRow>
          ))}
        </div>
      )}

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
    </div>
  )
}
