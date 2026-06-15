"use client"
import { useState } from "react"
import { Trash2, MapPin } from "lucide-react"
import type { Point, PointType } from "@/lib/dtos/point"
import { POINT_TYPE_META } from "@/lib/itinerary/point-icons"
import { ImageGallery } from "./image-gallery"

type PointAccordionItemProps = {
  point: Point
  index: number
  isOpen: boolean
  onToggle: () => void
  onPointChange: (id: string, fields: Partial<Point>) => void
  onDelete: (id: string) => void
  onFetchPois?: () => Promise<void>
  poiResults?: Point[]
  onPoiSelect?: (name: string) => void
}

export function PointAccordionItem({
  point,
  index,
  isOpen,
  onToggle,
  onPointChange,
  onDelete,
  onFetchPois,
  poiResults = [],
  onPoiSelect,
}: PointAccordionItemProps) {
  const [nameVal, setNameVal] = useState(point.name ?? "")
  const [notesVal, setNotesVal] = useState(point.notes ?? "")
  const [isFetchingPois, setIsFetchingPois] = useState(false)

  const { Icon } = POINT_TYPE_META[point.type]

  const handleTypeClick = (type: PointType) => {
    if (type === point.type) return
    onPointChange(point.id!, { type })
  }

  const handleNameBlur = () => {
    const trimmed = nameVal.trim()
    if (trimmed === (point.name ?? "")) return
    onPointChange(point.id!, { name: trimmed || null })
  }

  const handleNotesBlur = () => {
    const trimmed = notesVal.trim()
    if (trimmed === (point.notes ?? "")) return
    onPointChange(point.id!, { notes: trimmed || null })
  }

  const handleFetchPois = async () => {
    if (!onFetchPois) return
    setIsFetchingPois(true)
    await onFetchPois()
    setIsFetchingPois(false)
  }

  return (
    <div className="border-border/40 border-b last:border-b-0">
      <button
        aria-label={`Expand point ${index}`}
        onClick={onToggle}
        className="hover:bg-muted/40 flex w-full items-center gap-2 rounded px-0 py-1.5 text-left transition-colors"
      >
        <span className="text-muted-foreground w-3 shrink-0 text-[10px] select-none">
          {isOpen ? "−" : "+"}
        </span>
        <span className="text-muted-foreground w-4 shrink-0 text-[10px] tabular-nums">{index}</span>
        <Icon size={10} className="text-muted-foreground shrink-0" />
        <span className="text-foreground min-w-0 truncate text-xs">{point.name ?? "—"}</span>
      </button>

      {isOpen && (
        <div className="space-y-2 pb-2 pl-7">
          <div className="flex gap-1">
            {(["stop", "position", "interest"] as PointType[]).map((t) => {
              const { label, Icon: TIcon } = POINT_TYPE_META[t]
              const active = point.type === t
              return (
                <button
                  key={t}
                  aria-label={label}
                  onClick={() => handleTypeClick(t)}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <TIcon size={9} />
                  {label}
                </button>
              )
            })}
          </div>

          <input
            type="text"
            placeholder="Name"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={handleNameBlur}
            className="border-border/60 text-foreground placeholder:text-muted-foreground/50 focus:ring-ring w-full rounded border bg-transparent px-2 py-1 text-xs focus:ring-1 focus:outline-none"
          />

          <textarea
            placeholder="Notes"
            value={notesVal}
            onChange={(e) => setNotesVal(e.target.value)}
            onBlur={handleNotesBlur}
            rows={2}
            className="border-border/60 text-foreground placeholder:text-muted-foreground/50 focus:ring-ring w-full resize-none rounded border bg-transparent px-2 py-1 text-xs focus:ring-1 focus:outline-none"
          />

          {(point.images?.length ?? 0) > 0 && (
            <ImageGallery images={point.images!} onRemove={() => {}} />
          )}

          {point.type === "interest" && onFetchPois && (
            <div className="space-y-1">
              <button
                onClick={handleFetchPois}
                disabled={isFetchingPois}
                aria-label="Find nearby POIs"
                className="text-primary flex items-center gap-1 text-[10px] hover:underline disabled:opacity-50"
              >
                <MapPin size={10} />
                {isFetchingPois ? "Searching…" : "Find nearby POIs"}
              </button>

              {poiResults.length > 0 && (
                <ul className="space-y-0.5">
                  {poiResults.map((poi) => (
                    <li key={poi.id}>
                      <button
                        onClick={() => onPoiSelect?.(poi.name ?? "")}
                        className="text-foreground hover:text-primary w-full truncate text-left text-[10px] hover:underline"
                      >
                        {poi.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            aria-label="Delete point"
            onClick={() => onDelete(point.id!)}
            className="text-muted-foreground hover:text-destructive flex items-center gap-1 text-[10px] transition-colors"
          >
            <Trash2 size={10} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
