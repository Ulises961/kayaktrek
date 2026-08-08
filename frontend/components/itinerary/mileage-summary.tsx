"use client"

import { DISTANCE_UNIT, toNm, type DistanceUnit } from "@/lib/itinerary/distance"
import { EmptyState } from "@/components/common/empty-state"

function convert(km: number, unit: DistanceUnit): string {
  const value = unit === DISTANCE_UNIT.KM ? km : toNm(km)
  return `${value.toFixed(1)} ${unit}`
}

interface MileageSummaryProps {
  planned: number | null | undefined
  actual: number | null | undefined
  unit: DistanceUnit
}

export function MileageSummary({ planned, actual, unit }: MileageSummaryProps) {
  const hasData = planned != null || actual != null

  return (
    <div className="flex flex-col gap-3">
      {!hasData ? (
        <EmptyState variant="inline" title="No distance recorded yet." />
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
