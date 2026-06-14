"use client"
import { useState, useTransition } from "react"
import { Calendar, ChevronDown, Anchor, Star, CircleDot } from "lucide-react"
import { cn } from "@/lib/utils"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { updateDay } from "@/lib/itinerary/actions"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
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
    if (!value) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      const result = await updateDay(day.id!, { date: value })
      if (result.success) onDateSaved(value)
      setEditing(false)
    })
  }

  return (
    <div className="border-border/50 flex items-center gap-2 border-b px-3 py-1.5">
      <span className="text-foreground text-[11px] font-semibold">Day {day.dayNumber}</span>
      {editing ? (
        <input
          type="date"
          autoFocus
          defaultValue={day.date ?? ""}
          disabled={isPending}
          onBlur={() => setEditing(false)}
          onChange={handleChange}
          className="border-primary text-foreground h-5 border-0 border-b bg-transparent text-[11px] focus:outline-none"
          data-testid="date-input"
        />
      ) : (
        <>
          {day.date ? (
            <span className="text-muted-foreground text-[11px]">{formatDate(day.date)}</span>
          ) : (
            <span className="text-muted-foreground/60 text-[11px] italic">No date set</span>
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
      className="border-border bg-card hover:border-primary/50 flex h-full min-h-18 w-36 cursor-pointer flex-col overflow-hidden rounded-lg border transition-colors"
      onClick={() => onOpen(point.id!)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(point.id!)}
    >
      {firstImage?.location && (
        <div className="bg-muted h-16 shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={firstImage.location}
            alt={point.name ?? "Point photo"}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2">
        <div className="text-muted-foreground flex items-center gap-1.5">
          <span className="text-muted-foreground/70 w-4 shrink-0 font-mono text-xs">{index}</span>
          <TypeIcon type={point.type ?? "position"} />
          <span className="text-foreground min-w-0 flex-1 truncate text-xs font-medium">
            {displayLabel}
          </span>
        </div>
        {point.notes && <p className="text-muted-foreground line-clamp-2 text-xs">{point.notes}</p>}
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
    <div className="border-border border-t" data-testid="points-section">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-foreground flex w-full items-center justify-between px-3 py-2 text-xs font-semibold tracking-[0.06em] uppercase"
        aria-expanded={open}
      >
        <span>Waypoints{count > 0 ? ` (${count})` : ""}</span>
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && count > 0 && (
        <div className="py-2">
          <Carousel opts={{ align: "start", dragFree: true }}>
            <CarouselContent className="-ml-2 px-3">
              {entries.map(({ point, globalIdx }) => (
                <CarouselItem key={point.id} className="h-18 basis-auto pl-2">
                  <PointCard point={point} index={globalIdx} onOpen={onOpen} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
        </div>
      )}

      {open && count === 0 && (
        <p className="text-muted-foreground px-3 pb-2 text-xs">No waypoints for this day.</p>
      )}
    </div>
  )
}

export function DayDetailPanel() {
  const {
    state,
    selectedDayId,
    setSelectedPointId,
    isLeader,
    dispatch,
    selectedHour,
    setSelectedHour,
  } = useMapBuilder()

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
    <div className="bg-background/95 border-border border-t">
      {day && (
        <DayDateHeader
          day={day}
          isLeader={isLeader}
          onDateSaved={(date) => dispatch({ type: "DAY_UPDATE", id: day.id!, fields: { date } })}
        />
      )}
      <div className="border-border/50 flex items-center gap-3 border-b px-3 py-1.5">
        <span className="text-muted-foreground shrink-0 text-[11px]">Hr</span>
        <input
          type="range"
          min={0}
          max={23}
          value={selectedHour}
          onChange={(e) => setSelectedHour(Number(e.target.value))}
          className="accent-primary flex-1"
          aria-label="Map overlay hour"
          data-testid="hour-slider"
        />
        <span className="text-foreground font-mono text-[11px]">
          {String(selectedHour).padStart(2, "0")}:00
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto">
        <ConditionsSection dayId={selectedDayId} isLeader={isLeader} />
        <PointsSection entries={dayEntries} onOpen={setSelectedPointId} />
      </div>
    </div>
  )
}
