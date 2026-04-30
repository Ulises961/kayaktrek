"use client"

import { useTransition } from "react"
import { TRIP_DIFFICULTIES, type TripDifficulty } from "@/lib/dtos/trip"
import { updateTrip } from "@/lib/trips/actions"

const labels: Record<TripDifficulty, string> = {
  easy:      "Easy",
  moderate:  "Moderate",
  demanding: "Demanding",
  expert:    "Expert",
}

interface DifficultySelectProps {
  tripId: string
  value: TripDifficulty | null | undefined
}

export function DifficultySelect({ tripId, value }: DifficultySelectProps) {
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TripDifficulty | ""
    startTransition(async () => {
      await updateTrip(tripId, { difficulty: next || null })
    })
  }

  return (
    <select
      defaultValue={value ?? ""}
      onChange={handleChange}
      disabled={isPending}
      className="text-[10px] font-medium uppercase tracking-[0.06em] rounded-[3px] border border-input bg-background px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    >
      <option value="">No difficulty</option>
      {TRIP_DIFFICULTIES.map((d) => (
        <option key={d} value={d}>{labels[d]}</option>
      ))}
    </select>
  )
}
