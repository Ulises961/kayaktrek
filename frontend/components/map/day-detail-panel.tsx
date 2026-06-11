"use client"
import { useState, useTransition } from "react"
import { Calendar, ChevronDown, Anchor, Star, CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { updateDay } from "@/lib/itinerary/actions"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel"
import { ConditionsSection } from "@/components/weather/conditions-section"
import type { Day } from "@/lib/dtos/day"
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

function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

type DayDateHeaderProps = {
  day: Day
  isLeader: boolean
  onDateSaved: (date: string) => void
}

function DayDateHeader({ day, isLeader, onDateSaved }: DayDateHeaderProps) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (!value) { setEditing(false); return }
    startTransition(async () => {
      const result = await updateDay(day.id!, { date: value })
      if (result.success) onDateSaved(value)
      setEditing(false)
    })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50">
      <span className="text-[11px] font-semibold text-foreground">Day {day.dayNumber}</span>
      {editing ? (
        <input
          type="date"
          autoFocus
          defaultValue={day.date ?? ""}
          disabled={isPending}
          onBlur={() => setEditing(false)}
          onChange={handleChange}
          className="text-[11px] h-5 border-0 border-b border-primary bg-transparent text-foreground focus:outline-none"
          data-testid="date-input"
        />
      ) : (
        <>
          {day.date ? (
            <span className="text-[11px] text-muted-foreground">{formatDate(day.date)}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/60 italic">No date set</span>
          )}
          {isLeader && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit date"
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <Calendar className="size-3" />
            </button>
          )}
        </>
      )}
    </div>
  )
}

type PointEntry = { point: Point; globalIdx: number }

type PointCardProps = {
  point: Point
  index: number
  onOpen: (id: string) => void
}

function PointCard({ point, index, onOpen }: PointCardProps) {
  const firstImage = point.images?.[0]
  const displayLabel = point.name || coordLabel(point)

  return (
    <div
      className="flex flex-col rounded-lg border border-border bg-card overflow-hidden w-36 h-full min-h-18 cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onOpen(point.id!)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(point.id!)}
    >
      {firstImage?.location && (
        <div className="h-16 shrink-0 bg-muted overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={firstImage.location}
            alt={point.name ?? "Point photo"}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-col gap-1 p-2 flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-xs font-mono w-4 shrink-0 text-muted-foreground/70">{index}</span>
          <TypeIcon type={point.type ?? "position"} />
          <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">
            {displayLabel}
          </span>
        </div>
        {point.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{point.notes}</p>
        )}
      </div>
    </div>
  )
}

type PointsSectionProps = {
  entries: PointEntry[]
  onOpen: (id: string) => void
}

function PointsSection({ entries, onOpen }: PointsSectionProps) {
  const [open, setOpen] = useState(false)
  const count = entries.length

  return (
    <div className="border-t border-border" data-testid="points-section">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground"
        aria-expanded={open}
      >
        <span>Waypoints{count > 0 ? ` (${count})` : ""}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && count > 0 && (
        <div className="py-2">
          <Carousel opts={{ align: "start", dragFree: true }}>
            <CarouselContent className="-ml-2 px-3">
              {entries.map(({ point, globalIdx }) => (
                <CarouselItem key={point.id} className="pl-2 basis-auto h-18">
                  <PointCard point={point} index={globalIdx} onOpen={onOpen} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      )}

      {open && count === 0 && (
        <p className="px-3 pb-2 text-xs text-muted-foreground">No waypoints for this day.</p>
      )}
    </div>
  )
}

export function DayDetailPanel() {
  const { state, selectedDayId, setSelectedPointId, isLeader, dispatch } = useMapBuilder()

  if (!selectedDayId) return null

  const day = state.days.find((d) => d.id === selectedDayId)

  const dayEntries = state.pointOrder.reduce<PointEntry[]>((acc, id, i) => {
    const point = state.points.find((p) => p.id === id)
    if (point && point.dayId === selectedDayId) {
      acc.push({ point, globalIdx: i + 1 })
    }
    return acc
  }, [])

  return (
    <div className="bg-background/95 border-t border-border">
      {day && (
        <DayDateHeader
          day={day}
          isLeader={isLeader}
          onDateSaved={(date) => dispatch({ type: "DAY_UPDATE", id: day.id!, fields: { date } })}
        />
      )}
      <div className="max-h-80 overflow-y-auto">
        <ConditionsSection dayId={selectedDayId} isLeader={isLeader} />
        <PointsSection entries={dayEntries} onOpen={setSelectedPointId} />
      </div>
    </div>
  )
}
