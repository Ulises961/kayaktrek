"use client"
import { useState, useCallback } from "react"
import { ChevronLeft, ChevronRight, ImageIcon, Anchor, Star, CircleDot } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { updatePoint } from "@/lib/itinerary/actions"
import { cn } from "@/lib/utils"
import type { Point } from "@/lib/dtos/point"

type PointDetailModalProps = {
  point: Point
  canEdit: boolean
  onClose: () => void
}

function TypeBadge({ type }: { type: string }) {
  const Icon = type === "stop" ? Anchor : type === "interest" ? Star : CircleDot
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-[9px] font-bold tracking-widest uppercase">
      <Icon className="size-3" />
      {type}
    </span>
  )
}

function coordLabel(point: Point): string | null {
  if (point.latitude == null || point.longitude == null) return null
  const lat = `${Math.abs(point.latitude).toFixed(3)}°${point.latitude >= 0 ? "N" : "S"}`
  const lon = `${Math.abs(point.longitude).toFixed(3)}°${point.longitude >= 0 ? "E" : "W"}`
  return `${lat} · ${lon}`
}

export function PointDetailModal({ point, canEdit, onClose }: PointDetailModalProps) {
  const { dispatch } = useMapBuilder()
  const images = point.images ?? []

  const [imageIdx, setImageIdx] = useState(0)
  const [draftNotes, setDraftNotes] = useState(point.notes ?? "")

  const coords = coordLabel(point)
  const displayName = point.name || coords || "Waypoint"

  const handleNotesBlur = useCallback(async () => {
    const trimmed = draftNotes.trim()
    if (trimmed === (point.notes ?? "")) return
    dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { notes: trimmed } })
    await updatePoint(point.id!, { notes: trimmed })
  }, [draftNotes, point.id, point.notes, dispatch])

  const prev = () => setImageIdx((i) => (i - 1 + images.length) % images.length)
  const next = () => setImageIdx((i) => (i + 1) % images.length)
  const current = images[imageIdx]

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[80vh] max-w-md flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <div className="border-border/60 shrink-0 border-b px-4 py-3">
          <TypeBadge type={point.type ?? "position"} />
          <DialogTitle className="mt-0.5 text-sm leading-tight font-semibold">
            {displayName}
          </DialogTitle>
          {coords && <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">{coords}</p>}
        </div>

        {/* Image carousel */}
        <div
          className="border-border/40 bg-muted/30 relative shrink-0 border-b"
          style={{ height: "42%" }}
        >
          {images.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current?.location ?? ""}
                alt={current?.name ?? `Photo ${imageIdx + 1}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute right-2 bottom-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/90 backdrop-blur-sm">
                {imageIdx + 1} / {images.length}
              </span>
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={prev}
                    className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={next}
                    className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/30 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                  <div className="absolute bottom-2 flex w-full justify-center gap-1.5">
                    {images.map((img, i) => (
                      <button
                        key={img.id ?? i}
                        type="button"
                        aria-label={`Photo ${i + 1}`}
                        onClick={() => setImageIdx(i)}
                        className={cn(
                          "size-1.5 rounded-full transition-colors",
                          i === imageIdx ? "bg-white" : "bg-white/40",
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-muted-foreground/40 flex h-full flex-col items-center justify-center gap-2">
              <ImageIcon className="size-7" />
              <p className="text-[10px]">No photos yet</p>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <p className="text-muted-foreground mb-2 text-[9px] font-bold tracking-widest uppercase">
            Notes
          </p>
          {canEdit ? (
            <textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Landing notes, hazards, tidal timing, anything worth remembering…"
              className="border-border/40 bg-muted/20 placeholder:text-muted-foreground/40 focus:border-primary/50 min-h-0 flex-1 resize-none rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none"
            />
          ) : point.notes ? (
            <p className="text-foreground flex-1 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap">
              {point.notes}
            </p>
          ) : (
            <p className="text-muted-foreground/60 text-[13px] italic">No notes for this point.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
