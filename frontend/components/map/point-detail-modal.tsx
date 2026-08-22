"use client"
import { useState, useCallback, useRef } from "react"
import type { ChangeEvent, KeyboardEvent } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  ImageIcon,
  Anchor,
  CircleDot,
  Plus,
  Trash2,
} from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import {
  updatePoint,
  setImagePublic,
  setImageCaption,
  uploadPointImage,
  deletePointImage,
} from "@/lib/itinerary/actions"
import { cn } from "@/lib/utils"
import { POINT_TYPE, type Point, type PointType } from "@/lib/dtos/point"
import { useSaveStatus } from "@/hooks/use-save-status"
import { SaveStatusLine } from "@/components/common/save-status-line"

const TYPE_OPTIONS: { type: PointType; label: string; Icon: typeof Anchor }[] = [
  { type: POINT_TYPE.STOP, label: "Stop", Icon: Anchor },
  { type: POINT_TYPE.POSITION, label: "Position", Icon: CircleDot },
]

type PointDetailModalProps = {
  point: Point
  canEdit: boolean
  onClose: () => void
}

function TypeBadge({ type }: { type: string }) {
  const Icon = type === POINT_TYPE.STOP ? Anchor : CircleDot
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
  const { dispatch, state } = useMapBuilder()
  const images = point.images ?? []

  const [imageIdx, setImageIdx] = useState(0)
  const [draftName, setDraftName] = useState(point.name ?? "")
  const [draftNotes, setDraftNotes] = useState(point.notes ?? "")
  const { run: runNameSave } = useSaveStatus()
  const { status: notesSaveStatus, run: runNotesSave } = useSaveStatus()
  const { status: captionSaveStatus, run: runCaptionSave } = useSaveStatus()

  const coords = coordLabel(point)
  const displayName = point.name || coords || "Waypoint"

  // A day's start/end point is unconditionally a "stop" — the boundary IS the
  // overnight stop, so its type can't be changed here (that's what §G's boundary
  // editing owns instead).
  const isBoundary = state.days.some(
    (day) => day.startPointId === point.id || day.endPointId === point.id,
  )

  // Name is a quick edit — flush quietly (blur/Ctrl+Enter/close), no dedicated
  // button. Notes is where people spend real typing time, so it also gets an
  // explicit Save they can reach for without needing to know the flush triggers.
  // Bug fix (M15 sweep): both flushes used to dispatch the optimistic update
  // *before* awaiting updatePoint and never inspected its result — a failed
  // save (non-ok response) still landed in local state and still flipped the
  // status line to "Saved", identical in shape to the M14 orphan-leak bug
  // (state mutated unconditionally regardless of the outcome). Now the
  // dispatch only happens after a confirmed success, and a failure throws
  // inside runXSave so the status line correctly reverts to idle instead of
  // lying that the save succeeded.
  const flushName = useCallback(async () => {
    const trimmed = draftName.trim()
    if (trimmed === (point.name ?? "")) return
    try {
      await runNameSave(async () => {
        const result = await updatePoint(point.id!, { name: trimmed })
        if (!result.success) throw new Error(result.error)
        dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { name: trimmed } })
      })
    } catch {
      // Status already reverted to idle by runNameSave; nothing left to do —
      // callers (blur/Ctrl+Enter/close) don't need to react further.
    }
  }, [draftName, point.id, point.name, dispatch, runNameSave])

  const flushNotes = useCallback(async () => {
    const trimmed = draftNotes.trim()
    if (trimmed === (point.notes ?? "")) return
    try {
      await runNotesSave(async () => {
        const result = await updatePoint(point.id!, { notes: trimmed })
        if (!result.success) throw new Error(result.error)
        dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { notes: trimmed } })
      })
    } catch {
      // Status already reverted to idle by runNotesSave.
    }
  }, [draftNotes, point.id, point.notes, dispatch, runNotesSave])

  const handleKeyDownFlush = useCallback(
    (flush: () => Promise<void>) => (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        void flush()
      }
    },
    [],
  )

  const handleClose = useCallback(async () => {
    await Promise.all([flushName(), flushNotes()])
    onClose()
  }, [flushName, flushNotes, onClose])

  const handleTypeChange = useCallback(
    async (type: PointType) => {
      // Same fix as flushName/flushNotes above: check the result before
      // dispatching, matching the pattern already used by every image
      // mutation below (visibility toggle, upload, delete).
      const result = await updatePoint(point.id!, { type })
      if (!result.success) return
      dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { type } })
    },
    [point.id, dispatch],
  )

  const prev = () => setImageIdx((i) => (i - 1 + images.length) % images.length)
  const next = () => setImageIdx((i) => (i + 1) % images.length)
  const current = images[imageIdx]

  // Takes the value rather than reading draft state: the field is keyed on the image
  // id and left uncontrolled, so paging the carousel remounts it with that photo's
  // own caption instead of carrying the previous photo's text onto the next one.
  const flushCaption = useCallback(
    async (value: string) => {
      const trimmed = value.trim()
      if (!current?.id || trimmed === (current.caption ?? "")) return
      try {
        await runCaptionSave(async () => {
          const result = await setImageCaption(point.id!, current.id!, trimmed || null)
          if (!result.success) throw new Error(result.error)
          const updatedImages = (point.images ?? []).map((img) =>
            img.id === current.id ? result.image : img,
          )
          dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { images: updatedImages } })
        })
      } catch {
        // Status already reverted to idle by runCaptionSave.
      }
    },
    [current, point.id, point.images, dispatch, runCaptionSave],
  )

  const handleToggleVisibility = useCallback(async () => {
    if (!current?.id) return
    const result = await setImagePublic(point.id!, current.id, !current.isPublic)
    if (!result.success) return
    const updatedImages = (point.images ?? []).map((img) =>
      img.id === current.id ? result.image : img,
    )
    dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { images: updatedImages } })
  }, [current, point.id, point.images, dispatch])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file) return
      const formData = new FormData()
      formData.append("file", file)
      const result = await uploadPointImage(point.id!, formData)
      if (!result.success) return
      const updatedImages = [...(point.images ?? []), result.image]
      dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { images: updatedImages } })
      setImageIdx(updatedImages.length - 1)
    },
    [point.id, point.images, dispatch],
  )

  const handleDeletePhoto = useCallback(async () => {
    if (!current?.id) return
    const result = await deletePointImage(point.id!, current.id)
    if (!result.success) return
    const updatedImages = (point.images ?? []).filter((img) => img.id !== current.id)
    dispatch({ type: "POINT_UPDATE", id: point.id!, fields: { images: updatedImages } })
    setImageIdx((i) => Math.min(i, Math.max(updatedImages.length - 1, 0)))
  }, [current, point.id, point.images, dispatch])

  return (
    <Dialog open onOpenChange={(open) => !open && void handleClose()}>
      <DialogContent className="flex h-[80vh] max-w-md flex-col gap-0 overflow-hidden p-0">
        {/* Header — type indicator and title share one row; coords only appear once,
            as a subtitle, and are omitted entirely when they're already the title
            (unnamed point). */}
        <div className="border-border/60 shrink-0 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            {canEdit ? (
              <div className="border-border flex shrink-0 overflow-hidden rounded border">
                {TYPE_OPTIONS.map(({ type, label, Icon }) => (
                  <button
                    key={type}
                    type="button"
                    aria-label={label}
                    disabled={isBoundary}
                    title={isBoundary ? "Boundary points are always stops" : undefined}
                    onClick={() => !isBoundary && handleTypeChange(type)}
                    className={cn(
                      "flex items-center justify-center p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      (point.type ?? POINT_TYPE.POSITION) === type
                        ? "bg-primary text-primary-foreground"
                        : "enabled:hover:bg-muted",
                    )}
                  >
                    <Icon className="size-3" />
                  </button>
                ))}
              </div>
            ) : (
              <TypeBadge type={point.type ?? "position"} />
            )}
            {canEdit ? (
              <DialogTitle asChild>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => void flushName()}
                  onKeyDown={handleKeyDownFlush(flushName)}
                  placeholder={coords ?? "Waypoint"}
                  className="min-w-0 flex-1 truncate border-none bg-transparent p-0 text-sm leading-tight font-semibold focus:outline-none"
                />
              </DialogTitle>
            ) : (
              <DialogTitle className="min-w-0 flex-1 truncate text-sm leading-tight font-semibold">
                {displayName}
              </DialogTitle>
            )}
          </div>
          {coords && coords !== displayName && (
            <p className="text-muted-foreground mt-1 font-mono text-[10px]">{coords}</p>
          )}
        </div>

        {/* Image carousel */}
        <div
          className="border-border/40 bg-muted/30 relative shrink-0 border-b"
          style={{ height: "42%" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            data-testid="photo-file-input"
            className="hidden"
          />
          {images.length > 0 ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current?.location ?? ""}
                // The caption describes the photo; the filename only names the file.
                alt={current?.caption || `Photo ${imageIdx + 1}`}
                className="h-full w-full object-cover"
              />
              <span className="absolute right-2 bottom-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-white/90 backdrop-blur-sm">
                {imageIdx + 1} / {images.length}
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label={`Make photo ${current?.isPublic ? "private" : "public"}`}
                  onClick={handleToggleVisibility}
                  className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  {current?.isPublic ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                  {current?.isPublic ? "Public" : "Private"}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  aria-label="Add photo"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute top-2 right-2 rounded-full bg-black/40 p-1 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  <Plus className="size-3" />
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  aria-label="Delete photo"
                  onClick={handleDeletePhoto}
                  className="absolute bottom-2 left-2 rounded-full bg-black/40 p-1 text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
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
          ) : canEdit ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground/40 hover:text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 transition-colors"
            >
              <ImageIcon className="size-7" />
              <p className="text-[10px]">Add a photo</p>
            </button>
          ) : (
            <div className="text-muted-foreground/40 flex h-full flex-col items-center justify-center gap-2">
              <ImageIcon className="size-7" />
              <p className="text-[10px]">No photos yet</p>
            </div>
          )}
        </div>

        {/* Caption — what this photo shows. The public gallery is flat, with no
            grouping headings, so this is the only thing naming a photo there. */}
        {current && (
          <div className="border-border/50 flex items-center gap-2 border-b px-4 py-2">
            {canEdit ? (
              <>
                <input
                  key={current.id}
                  aria-label="Photo caption"
                  defaultValue={current.caption ?? ""}
                  onBlur={(e) => void flushCaption(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault()
                      void flushCaption(e.currentTarget.value)
                    }
                  }}
                  maxLength={300}
                  placeholder="What does this photo show?"
                  className="placeholder:text-muted-foreground/60 min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
                <SaveStatusLine status={captionSaveStatus} />
              </>
            ) : (
              current.caption && <p className="text-muted-foreground text-xs">{current.caption}</p>
            )}
          </div>
        )}

        {/* Notes */}
        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
              Notes
            </p>
            {canEdit && <SaveStatusLine status={notesSaveStatus} />}
          </div>
          {canEdit ? (
            <>
              <textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                onBlur={() => void flushNotes()}
                onKeyDown={handleKeyDownFlush(flushNotes)}
                placeholder="Landing notes, hazards, tidal timing, anything worth remembering…"
                className="border-border/40 bg-muted/20 placeholder:text-muted-foreground/40 focus:border-primary/50 min-h-0 flex-1 resize-none rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void flushNotes()}
                className="text-primary hover:text-primary/80 mt-2 self-end text-xs font-medium transition-colors"
              >
                Save
              </button>
            </>
          ) : point.notes ? (
            <p className="text-foreground flex-1 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap">
              {point.notes}
            </p>
          ) : (
            <p className="text-muted-foreground text-[13px] italic">No notes for this point.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
