"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { ListRow } from "@/components/common/list-row"
import { listMyLogs, listEndorsedLogs } from "@/lib/logs/actions"
import { LogCard } from "./log-card"
import { LOG_SORT, type Log, type LogPage, type LogSort } from "@/lib/dtos/log"
import type { DistanceUnit } from "@/lib/itinerary/distance"

const SORTS: { value: LogSort; label: string }[] = [
  { value: LOG_SORT.NEWEST, label: "Newest first" },
  { value: LOG_SORT.OLDEST, label: "Oldest first" },
]

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
  const [isPending, startTransition] = useTransition()
  const latestRequest = useRef(0)

  const fetchPage = kind === "mine" ? listMyLogs : listEndorsedLogs

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

  // Refetch page 1 whenever sort changes. Skip the very first run — the server
  // already provided `initial`. A request id discards stale responses that
  // resolve out of order (mirrors ExploreDiscovery's pattern).
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const requestId = ++latestRequest.current
    startTransition(async () => {
      const result = await fetchPage(1, sort)
      if (requestId !== latestRequest.current) return
      setItems(result.items)
      setPage(result.page)
      setPages(result.pages)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort])

  function loadMore() {
    if (page >= pages || isPending) return
    const requestId = ++latestRequest.current
    startTransition(async () => {
      const result = await fetchPage(page + 1, sort)
      if (requestId !== latestRequest.current) return
      setItems((prev) => [...prev, ...result.items])
      setPage(result.page)
      setPages(result.pages)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
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
        <p className="text-muted-foreground text-sm">
          {kind === "mine" ? "No logs yet. Record your first session." : "No endorsed logs yet."}
        </p>
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
