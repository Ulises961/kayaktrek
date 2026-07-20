"use client"

import { useState, useTransition } from "react"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/common/form-field"
import { setUnitPreference } from "@/lib/profile/actions"
import { DISTANCE_UNIT, type DistanceUnit } from "@/lib/itinerary/distance"

interface UnitPreferenceSelectProps {
  initialUnit: DistanceUnit
}

export function UnitPreferenceSelect({ initialUnit }: UnitPreferenceSelectProps) {
  const [unit, setUnit] = useState(initialUnit)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as DistanceUnit
    const previous = unit
    setError(null)
    setUnit(next) // optimistic
    startTransition(async () => {
      const result = await setUnitPreference(next)
      if (!result.success) {
        setUnit(previous) // revert
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="unitPreference">Distance unit</Label>
      <NativeSelect
        id="unitPreference"
        className="max-w-40"
        value={unit}
        onChange={handleChange}
        disabled={isPending}
      >
        <option value={DISTANCE_UNIT.NM}>Nautical miles (nm)</option>
        <option value={DISTANCE_UNIT.KM}>Kilometres (km)</option>
      </NativeSelect>
      <p className="text-muted-foreground text-xs">Used across the planner, logbook, and stats.</p>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  )
}
