"use client"
import { useState, useCallback } from "react"
import { Anchor, Star, CircleDot, GripVertical } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { updatePoint } from "@/lib/itinerary/actions"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import type { Point } from "@/lib/dtos/point"

function TypeIcon({ type }: { type: string }) {
  if (type === "stop") return <Anchor className="size-3.5 shrink-0" />
  if (type === "interest") return <Star className="size-3.5 shrink-0" />
  return <CircleDot className="size-3.5 shrink-0" />
}

function coordLabel(point: Point): string {
  if (point.latitude != null && point.longitude != null) {
    return `${point.latitude.toFixed(4)}°, ${point.longitude.toFixed(4)}°`
  }
  return "—"
}

type PointCardProps = {
  point: Point
  index: number
  canEdit: boolean
  onSave: (id: string, fields: Partial<Pick<Point, "name" | "notes">>) => void
}

function PointCard({ point, index, canEdit, onSave }: PointCardProps) {
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

  const firstImage = point.images?.[0]
  const displayLabel = point.name || coordLabel(point)

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card overflow-hidden w-36">
      {firstImage?.location && (
        <div className="h-16 shrink-0 bg-muted overflow-hidden">
          <img
            src={firstImage.location}
            alt={point.name ?? "Point photo"}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 min-w-0">
        <div className="w-5 shrink-0 flex items-center justify-center border-r border-border/40 text-muted-foreground/30 cursor-grab active:cursor-grabbing">
          <GripVertical className="size-3" />
        </div>
        <div className="flex flex-col gap-1 p-2 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-xs font-mono w-4 shrink-0 text-muted-foreground/70">{index}</span>
            <TypeIcon type={point.type ?? "position"} />
            {canEdit ? (
              <input
                className="flex-1 min-w-0 bg-transparent text-xs font-medium text-foreground placeholder-muted-foreground/60 focus:outline-none border-b border-transparent focus:border-border"
                value={draftName}
                placeholder={coordLabel(point)}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleNameBlur}
              />
            ) : (
              <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
                {displayLabel}
              </span>
            )}
          </div>
          {canEdit ? (
            <input
              className="w-full bg-transparent text-xs text-muted-foreground placeholder-muted-foreground/60 focus:outline-none border-b border-transparent focus:border-border/50"
              value={draftNotes}
              placeholder="Notes…"
              onChange={(e) => setDraftNotes(e.target.value)}
              onBlur={handleNotesBlur}
            />
          ) : point.notes ? (
            <p className="text-xs text-muted-foreground line-clamp-2">{point.notes}</p>
          ) : null}
        </div>
      </div>
    </div>
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
    <div className="bg-background/95 border-t border-border py-2">
      <Carousel opts={{ align: "start", dragFree: true }}>
        <CarouselContent className="-ml-2 px-3">
          {dayPoints.map((point) => {
            const globalIdx = state.pointOrder.indexOf(point.id!) + 1
            return (
              <CarouselItem key={point.id} className="pl-2 basis-auto">
                <PointCard point={point} index={globalIdx} canEdit={canEdit} onSave={handleSave} />
              </CarouselItem>
            )
          })}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
