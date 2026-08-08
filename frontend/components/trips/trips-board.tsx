"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { ListFilterPopover } from "@/components/common/list-filter-popover"
import {
  TRIP_DIFFICULTIES,
  TRIP_DIFFICULTY_LABELS,
  TRIP_STATE,
  TRIP_SORT,
  type TripDifficulty,
  type TripPage,
} from "@/lib/dtos/trip"
import { TripsSection, PLANNING_SORT_OPTIONS } from "./trips-section"
import { EmptyState } from "@/components/common/empty-state"

interface TripsBoardProps {
  initialHappening: TripPage
  initialPlanning: TripPage
  initialPast: TripPage
}

function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

// Owns the difficulty/distance filter bar shared across the three
// independently-paginated state buckets below it (M12 §24 follow-up) — a
// filter change refetches page 1 of every section, same as changing a
// section's own sort.
export function TripsBoard({ initialHappening, initialPlanning, initialPast }: TripsBoardProps) {
  const [difficulty, setDifficulty] = useState<TripDifficulty | "">("")
  const [minMiles, setMinMiles] = useState("")
  const [maxMiles, setMaxMiles] = useState("")
  const [emptyByState, setEmptyByState] = useState<Record<string, boolean>>({})

  const filters = {
    difficulty: difficulty || undefined,
    minMiles: toNumber(minMiles),
    maxMiles: toNumber(maxMiles),
  }
  const difficultyActive = !!filters.difficulty
  const distanceActive = filters.minMiles != null || filters.maxMiles != null
  const activeFilterCount = (difficultyActive ? 1 : 0) + (distanceActive ? 1 : 0)
  const allSectionsEmpty =
    Object.keys(emptyByState).length === 3 && Object.values(emptyByState).every(Boolean)

  // A fresh closure per render (each call captures its own `state` key) is
  // fine — TripsSection's effect only depends on `total`, not this callback's
  // identity, so a new closure each render never causes a spurious refetch.
  function markEmpty(state: string) {
    return (empty: boolean) =>
      setEmptyByState((prev) => (prev[state] === empty ? prev : { ...prev, [state]: empty }))
  }

  function clearFilters() {
    setDifficulty("")
    setMinMiles("")
    setMaxMiles("")
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border flex items-center border-b pb-4">
        <ListFilterPopover activeCount={activeFilterCount} onClear={clearFilters}>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">Difficulty</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as TripDifficulty | "")}
              aria-label="Filter by difficulty"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="">Any</option>
              {TRIP_DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {TRIP_DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
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
          </div>
        </ListFilterPopover>
      </div>

      {activeFilterCount > 0 && allSectionsEmpty && (
        <EmptyState variant="inline" title="No trips match these filters." />
      )}

      <TripsSection
        label="Happening"
        state={TRIP_STATE.HAPPENING}
        initial={initialHappening}
        defaultSort={TRIP_SORT.LATEST_END}
        filters={filters}
        hero
        onEmptyChange={markEmpty(TRIP_STATE.HAPPENING)}
      />
      <TripsSection
        label="Planning"
        state={TRIP_STATE.BUILDING}
        initial={initialPlanning}
        defaultSort={TRIP_SORT.SOONEST}
        sortOptions={PLANNING_SORT_OPTIONS}
        filters={filters}
        onEmptyChange={markEmpty(TRIP_STATE.BUILDING)}
      />
      <TripsSection
        label="Past"
        state={TRIP_STATE.PAST}
        initial={initialPast}
        defaultSort={TRIP_SORT.LATEST_END}
        filters={filters}
        onEmptyChange={markEmpty(TRIP_STATE.PAST)}
      />
    </div>
  )
}
