"use client"

import { useTransition } from "react"
import { TRIP_DIFFICULTIES, type TripDifficulty } from "@/lib/dtos/trip"
import { updateTrip } from "@/lib/trips/actions"

const labels: Record<TripDifficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  demanding: "Demanding",
  expert: "Expert",
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
      className="border-input bg-background focus:ring-ring rounded-[3px] border px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase focus:ring-1 focus:outline-none disabled:opacity-50"
    >
      <option value="">No difficulty</option>
      {TRIP_DIFFICULTIES.map((d) => (
        <option key={d} value={d}>
          {labels[d]}
        </option>
      ))}
    </select>
  )
}
