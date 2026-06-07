"use client"
import { useState, useEffect, useCallback } from "react"
import { X, Anchor, Star, CircleDot, LocateFixed } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { updatePoint } from "@/lib/itinerary/actions"
import type { Point } from "@/lib/dtos/point"

function TypeLabel({ type }: { type: string }) {
  if (type === "stop") return <><Anchor className="size-3.5" /> Overnight stop</>
  if (type === "interest") return <><Star className="size-3.5" /> Point of interest</>
  return <><CircleDot className="size-3.5" /> Waypoint</>
}

function coordLabel(point: Point): string {
  if (point.latitude != null && point.longitude != null) {
    return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
  }
  return "—"
}

export function PointDetailSheet() {
  const { state, dispatch, selectedPointId, setSelectedPointId, isLeader, tripState } = useMapBuilder()

  const point = selectedPointId
    ? (state.points.find((p) => p.id === selectedPointId) ?? null)
    : null

  const canEdit = isLeader && tripState !== "past"

  const [draftName, setDraftName] = useState(point?.name ?? "")
  const [draftNotes, setDraftNotes] = useState(point?.notes ?? "")

  // Reset drafts when the selected point changes
  useEffect(() => {
    setDraftName(point?.name ?? "")
    setDraftNotes(point?.notes ?? "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.id])

  const handleNameBlur = useCallback(async () => {
    if (!point) return
    const trimmed = draftName.trim()
    if (trimmed !== (point.name ?? "")) {
      dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { name: trimmed } })
      await updatePoint(point.id!, { name: trimmed })
    }
  }, [draftName, point, dispatch])

  const handleNotesBlur = useCallback(async () => {
    if (!point) return
    const trimmed = draftNotes.trim()
    if (trimmed !== (point.notes ?? "")) {
      dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { notes: trimmed } })
      await updatePoint(point.id!, { notes: trimmed })
    }
  }, [draftNotes, point, dispatch])

  if (!selectedPointId || !point) return null

  const globalIdx = state.pointOrder.indexOf(selectedPointId) + 1
  const displayName = point.name || coordLabel(point)

  return (
    <div
      className="absolute inset-0 z-[1002] animate-in fade-in duration-300"
      onClick={() => setSelectedPointId(null)}
    >
      <div
        className="absolute bottom-0 left-0 right-0 bg-background border-t border-border rounded-t-2xl shadow-xl flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ maxHeight: "55vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="text-xs font-mono text-muted-foreground/70 shrink-0 w-4">{globalIdx}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <TypeLabel type={point.type ?? "position"} />
            </span>
            <span className="font-medium truncate">{displayName}</span>
          </div>
          <button
            onClick={() => setSelectedPointId(null)}
            className="shrink-0 ml-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 flex flex-col gap-4 p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <LocateFixed className="size-3.5 shrink-0" />
            <span className="text-xs font-mono">{coordLabel(point)}</span>
          </div>

          {canEdit ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
              <input
                className="w-full bg-transparent text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none border-b border-border/50 focus:border-border pb-1"
                value={draftName}
                placeholder="Add a name…"
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleNameBlur}
              />
            </div>
          ) : point.name ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</p>
              <p className="text-sm text-foreground">{point.name}</p>
            </div>
          ) : null}

          {canEdit ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
              <textarea
                className="w-full bg-transparent text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none border border-border/50 focus:border-border rounded-md p-2 resize-none min-h-[80px]"
                value={draftNotes}
                placeholder="Add notes…"
                rows={4}
                onChange={(e) => setDraftNotes(e.target.value)}
                onBlur={handleNotesBlur}
              />
            </div>
          ) : point.notes ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{point.notes}</p>
            </div>
          ) : null}

          {point.images && point.images.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Photos</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {point.images.map((img) => (
                  <img
                    key={img.id}
                    src={img.location}
                    alt={img.name}
                    className="h-32 w-auto rounded-lg shrink-0 object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {!canEdit && !point.notes && (!point.images || point.images.length === 0) && (
            <p className="text-sm text-muted-foreground">No notes or photos for this point.</p>
          )}
        </div>
      </div>
    </div>
  )
}
