"use client"

import { useState } from "react"
import { DISTANCE_UNIT, type DistanceUnit } from "@/lib/itinerary/distance"

const KM_PER_NM = 1.852

function convert(km: number, unit: DistanceUnit): string {
  const value = unit === DISTANCE_UNIT.KM ? km : km / KM_PER_NM
  return `${value.toFixed(1)} ${unit}`
}

function readStoredUnit(): DistanceUnit {
  if (typeof window === "undefined") return DISTANCE_UNIT.KM
  const stored = localStorage.getItem("distanceUnit")
  return stored === DISTANCE_UNIT.KM || stored === DISTANCE_UNIT.NM ? stored : DISTANCE_UNIT.KM
}

interface MileageSummaryProps {
  planned: number | null | undefined
  actual: number | null | undefined
}

export function MileageSummary({ planned, actual }: MileageSummaryProps) {
  const [unit, setUnit] = useState<DistanceUnit>(readStoredUnit)

  function toggleUnit(next: DistanceUnit) {
    setUnit(next)
    localStorage.setItem("distanceUnit", next)
  }

  const hasData = planned != null || actual != null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 self-end">
        {([DISTANCE_UNIT.KM, DISTANCE_UNIT.NM] as DistanceUnit[]).map((u) => (
          <button
            key={u}
            onClick={() => toggleUnit(u)}
            aria-label={u}
            className={`rounded border px-2 py-0.5 text-xs transition-colors ${
              unit === u
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-input hover:border-primary"
            }`}
          >
            {u}
          </button>
        ))}
      </div>

      {!hasData ? (
        <p className="text-muted-foreground text-sm">No distance recorded yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs tracking-wide uppercase">Planned</span>
            <span className="text-sm font-medium">
              {planned != null ? convert(planned, unit) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs tracking-wide uppercase">Actual</span>
            <span className="text-sm font-medium">
              {actual != null ? convert(actual, unit) : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
