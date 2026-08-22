"use client"

import { useTransition } from "react"
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty } from "@/lib/dtos/difficulty"
import { updateTrip } from "@/lib/trips/actions"

interface DifficultySelectProps {
  tripId: string
  value: Difficulty | null | undefined
}

export function DifficultySelect({ tripId, value }: DifficultySelectProps) {
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Difficulty | ""
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
      {DIFFICULTIES.map((difficulty) => (
        <option key={difficulty} value={difficulty}>
          {DIFFICULTY_LABELS[difficulty]}
        </option>
      ))}
    </select>
  )
}
