"use client"

import { useState } from "react"

const KM_PER_NM = 1.852
type Unit = "km" | "nm"

function convert(km: number, unit: Unit): string {
  const value = unit === "km" ? km : km / KM_PER_NM
  return `${value.toFixed(1)} ${unit}`
}

function readStoredUnit(): Unit {
  if (typeof window === "undefined") return "km"
  const stored = localStorage.getItem("distanceUnit")
  return stored === "km" || stored === "nm" ? stored : "km"
}

interface MileageSummaryProps {
  planned: number | null | undefined
  actual: number | null | undefined
}

export function MileageSummary({ planned, actual }: MileageSummaryProps) {
  const [unit, setUnit] = useState<Unit>(readStoredUnit)

  function toggleUnit(next: Unit) {
    setUnit(next)
    localStorage.setItem("distanceUnit", next)
  }

  const hasData = planned != null || actual != null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 self-end">
        {(["km", "nm"] as Unit[]).map((u) => (
          <button
            key={u}
            onClick={() => toggleUnit(u)}
            aria-label={u}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
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
        <p className="text-sm text-muted-foreground">No distance recorded yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Planned</span>
            <span className="text-sm font-medium">
              {planned != null ? convert(planned, unit) : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Actual</span>
            <span className="text-sm font-medium">
              {actual != null ? convert(actual, unit) : "—"}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
