"use client"
import { useState, useEffect, useCallback } from "react"
import { X, Anchor, Star, CircleDot, LocateFixed } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { updatePoint } from "@/lib/itinerary/actions"
import type { Point } from "@/lib/dtos/point"

function TypeLabel({ type }: { type: string }) {
  if (type === "stop")
    return (
      <>
        <Anchor className="size-3.5" /> Overnight stop
      </>
    )
  if (type === "interest")
    return (
      <>
        <Star className="size-3.5" /> Point of interest
      </>
    )
  return (
    <>
      <CircleDot className="size-3.5" /> Waypoint
    </>
  )
}

function coordLabel(point: Point): string {
  if (point.latitude != null && point.longitude != null) {
    return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`
  }
  return "—"
}

export function PointDetailSheet() {
  const { state, dispatch, selectedPointId, setSelectedPointId, isLeader, tripState } =
    useMapBuilder()

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
      className="animate-in fade-in absolute inset-0 z-[1002] duration-300"
      onClick={() => setSelectedPointId(null)}
    >
      <div
        className="bg-background border-border animate-in slide-in-from-bottom absolute right-0 bottom-0 left-0 flex flex-col rounded-t-2xl border-t shadow-xl duration-300"
        style={{ maxHeight: "55vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-border flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="text-muted-foreground/70 w-4 shrink-0 font-mono text-xs">
              {globalIdx}
            </span>
            <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
              <TypeLabel type={point.type ?? "position"} />
            </span>
            <span className="truncate font-medium">{displayName}</span>
          </div>
          <button
            onClick={() => setSelectedPointId(null)}
            className="text-muted-foreground hover:text-foreground ml-3 shrink-0 transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="text-muted-foreground flex items-center gap-1.5">
            <LocateFixed className="size-3.5 shrink-0" />
            <span className="font-mono text-xs">{coordLabel(point)}</span>
          </div>

          {canEdit ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Name
              </label>
              <input
                className="text-foreground placeholder-muted-foreground/60 border-border/50 focus:border-border w-full border-b bg-transparent pb-1 text-sm focus:outline-none"
                value={draftName}
                placeholder="Add a name…"
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleNameBlur}
              />
            </div>
          ) : point.name ? (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Name
              </p>
              <p className="text-foreground text-sm">{point.name}</p>
            </div>
          ) : null}

          {canEdit ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Notes
              </label>
              <textarea
                className="text-foreground placeholder-muted-foreground/60 border-border/50 focus:border-border min-h-[80px] w-full resize-none rounded-md border bg-transparent p-2 text-sm focus:outline-none"
                value={draftNotes}
                placeholder="Add notes…"
                rows={4}
                onChange={(e) => setDraftNotes(e.target.value)}
                onBlur={handleNotesBlur}
              />
            </div>
          ) : point.notes ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Notes
              </p>
              <p className="text-foreground text-sm whitespace-pre-wrap">{point.notes}</p>
            </div>
          ) : null}

          {point.images && point.images.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Photos
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {point.images.map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={img.id}
                    src={img.location}
                    alt={img.name}
                    className="h-32 w-auto shrink-0 rounded-lg object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {!canEdit && !point.notes && (!point.images || point.images.length === 0) && (
            <p className="text-muted-foreground text-sm">No notes or photos for this point.</p>
          )}
        </div>
      </div>
    </div>
  )
}
