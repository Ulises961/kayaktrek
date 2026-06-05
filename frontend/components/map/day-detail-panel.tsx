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
  canEdit: boolean
  onSave: (id: string, fields: Partial<Pick<Point, "name" | "notes">>) => void
}

function DetailPointRow({ point, index, canEdit, onSave }: PointRowProps) {
  const [draftName, setDraftName] = useState(point.name ?? "")
  const [draftNotes, setDraftNotes] = useState(point.notes ?? "")

  const handleNameBlur = useCallback(() => {
    const trimmed = draftName.trim()
    if (trimmed !== (point.name ?? "")) {
      onSave(point.id!, { name: trimmed })
    }
  }, [draftName, point.name, point.id, onSave])

  const handleNotesBlur = useCallback(() => {
    const trimmed = draftNotes.trim()
    if (trimmed !== (point.notes ?? "")) {
      onSave(point.id!, { notes: trimmed })
    }
  }, [draftNotes, point.notes, point.id, onSave])

  const label = point.name || String(index)

  return (
    <li className="flex flex-col px-3 py-1.5 text-sm hover:bg-muted/30 rounded">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-4 shrink-0">{index}</span>
        <span className="text-muted-foreground w-5 shrink-0 text-center">
          {TYPE_ICON[point.type ?? "position"] ?? "·"}
        </span>
        {canEdit ? (
          <input
            className="flex-1 min-w-0 bg-transparent text-foreground placeholder-muted-foreground focus:outline-none border-b border-transparent focus:border-border"
            value={draftName}
            placeholder={String(index)}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={handleNameBlur}
          />
        ) : (
          <span className="flex-1 min-w-0 text-foreground truncate">{label}</span>
        )}
      </div>
      {canEdit ? (
        <div className="pl-9">
          <input
            className="w-full bg-transparent text-xs text-muted-foreground placeholder-muted-foreground/60 focus:outline-none border-b border-transparent focus:border-border/50"
            value={draftNotes}
            placeholder="Notes…"
            onChange={(e) => setDraftNotes(e.target.value)}
            onBlur={handleNotesBlur}
          />
        </div>
      ) : point.notes ? (
        <p className="pl-9 text-xs text-muted-foreground truncate">{point.notes}</p>
      ) : null}
    </li>
  )
}

export function DayDetailPanel() {
  const { state, dispatch, selectedDayId, isLeader, tripState } = useMapBuilder()

  if (!selectedDayId) return null

  const canEdit = isLeader && tripState !== "past"

  const dayPoints = state.pointOrder
    .map((id) => state.points.find((p) => p.id === id))
    .filter((p): p is Point => p !== undefined && p.dayId === selectedDayId)

  const handleSave = useCallback(
    async (id: string, fields: Partial<Pick<Point, "name" | "notes">>) => {
      dispatch({ type: "POINT_UPDATE", id, fields })
      await updatePoint(id, fields)
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
              canEdit={canEdit}
              onSave={handleSave}
            />
          )
        })}
      </ul>
    </div>
  )
}
