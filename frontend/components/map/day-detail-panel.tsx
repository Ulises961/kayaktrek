"use client"
import { useState, useCallback } from "react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { updatePoint } from "@/lib/itinerary/actions"
import type { Point } from "@/lib/dtos/point"

const TYPE_ICON: Record<string, string> = {
  stop: "⚓",
  position: "·",
  interest: "★",
}

type PointRowProps = {
  point: Point
  index: number
  isLeader: boolean
  onNameSave: (id: string, name: string) => void
}

function DetailPointRow({ point, index, isLeader, onNameSave }: PointRowProps) {
  const [draft, setDraft] = useState(point.name ?? "")

  const handleBlur = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed !== (point.name ?? "")) {
      onNameSave(point.id!, trimmed)
    }
  }, [draft, point.name, point.id, onNameSave])

  const label = point.name || String(index)

  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/30 rounded">
      <span className="text-xs text-muted-foreground w-4 shrink-0">{index}</span>
      <span className="text-muted-foreground w-5 shrink-0 text-center">
        {TYPE_ICON[point.type ?? "position"] ?? "·"}
      </span>
      {isLeader ? (
        <input
          className="flex-1 min-w-0 bg-transparent text-foreground placeholder-muted-foreground focus:outline-none border-b border-transparent focus:border-border"
          value={draft}
          placeholder={String(index)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
        />
      ) : (
        <span className="flex-1 min-w-0 text-foreground truncate">{label}</span>
      )}
    </li>
  )
}

export function DayDetailPanel() {
  const { state, dispatch, selectedDayId, isLeader } = useMapBuilder()

  if (!selectedDayId) return null

  const dayPoints = state.pointOrder
    .map((id) => state.points.find((p) => p.id === id))
    .filter((p): p is Point => p !== undefined && p.dayId === selectedDayId)

  const handleNameSave = useCallback(
    async (id: string, name: string) => {
      dispatch({ type: "POINT_UPDATE", id, fields: { name } })
      await updatePoint(id, { name })
    },
    [dispatch],
  )

  return (
    <div className="bg-background/95 border-t border-border max-h-[40vh] overflow-y-auto">
      <ul role="list" className="py-1">
        {dayPoints.map((point, i) => {
          const globalIdx = state.pointOrder.indexOf(point.id!) + 1
          return (
            <DetailPointRow
              key={point.id}
              point={point}
              index={globalIdx || i + 1}
              isLeader={isLeader}
              onNameSave={handleNameSave}
            />
          )
        })}
      </ul>
    </div>
  )
}
