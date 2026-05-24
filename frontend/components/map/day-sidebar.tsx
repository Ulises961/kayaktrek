"use client"
import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { SlidePhase } from "@/lib/types/ui"
import { PointAccordionItem } from "./point-accordion-item"

type DayDateInputProps = {
  isoValue: string | null | undefined
  dayId: string
  onDateChange: (dayId: string, iso: string) => void
}

function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return ""
  const [yyyy, mm, dd] = iso.split("-")
  return `${dd}/${mm}/${yyyy}`
}

function DayDateInput({ isoValue, dayId, onDateChange }: DayDateInputProps) {
  const [draft, setDraft] = useState(() => isoToDisplay(isoValue))

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setDraft(raw)
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (match) {
      const [, dd, mm, yyyy] = match
      onDateChange(dayId, `${yyyy}-${mm}-${dd}`)
    }
  }

  return (
    <input
      type="text"
      value={draft}
      onChange={handleChange}
      placeholder="DD/MM/YYYY"
      maxLength={10}
      className="w-full text-xs bg-transparent border border-border/60 rounded px-2 py-1 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring font-mono mb-2"
    />
  )
}

import type { Day } from "@/lib/dtos/day"
import type { Point } from "@/lib/dtos/point"
import type { SlideState } from "@/lib/itinerary/map-reducer"
import { getDayColor } from "@/lib/itinerary/colors"
import { totalDistanceNm, formatDistance } from "@/lib/itinerary/distance"

type DaySidebarProps = {
  days: Day[]
  points: Point[]
  pointOrder: string[]
  slideState: SlideState | null
  distanceUnit: "nm" | "km"
  activePointId: string | null
  onActivePointChange: (id: string | null) => void
  onPointChange: (id: string, fields: Partial<Point>) => void
  onEditDay: (dayId: string) => void
  onEditDayStart: (dayId: string) => void
  onDeleteDay: (dayId: string) => void
  onDateChange: (dayId: string, date: string) => void
  onAddDay: () => void
  onSaveSlide: (dayId: string) => void
  onCancelSlide: (dayId: string) => void
}

function getPointLabel(id: string | null | undefined, points: Point[], pointOrder: string[]): string {
  if (!id) return "—"
  const p = points.find((pt) => pt.id === id)
  if (p?.name) return p.name
  const idx = pointOrder.indexOf(id)
  return idx >= 0 ? `Point ${idx + 1}` : "—"
}

function getDayDistanceNm(day: Day, points: Point[], pointOrder: string[]): number {
  const dayPointIds = new Set(
    points.filter((p) => p.dayId === day.id && p.id).map((p) => p.id!)
  )
  const ordered = pointOrder
    .filter((id) => dayPointIds.has(id))
    .map((id) => points.find((p) => p.id === id)!)
    .filter(Boolean)
    .filter((p): p is Point & { latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null
    )
  return totalDistanceNm(ordered)
}

type DayCardProps = {
  day: Day
  points: Point[]
  pointOrder: string[]
  slideState: SlideState | null
  distanceUnit: "nm" | "km"
  activePointId: string | null
  onActivePointChange: (id: string | null) => void
  onPointChange: (id: string, fields: Partial<Point>) => void
  onEditDay: (dayId: string) => void
  onEditDayStart: (dayId: string) => void
  onDeleteDay: (dayId: string) => void
  onDateChange: (dayId: string, date: string) => void
  onSaveSlide: (dayId: string) => void
  onCancelSlide: (dayId: string) => void
}

function DayCard({ day, points, pointOrder, slideState, distanceUnit, activePointId, onActivePointChange, onPointChange, onEditDay, onEditDayStart, onDeleteDay, onDateChange, onSaveSlide, onCancelSlide }: DayCardProps) {
  const color = getDayColor(day.dayNumber)
  const isActiveSlide = slideState?.dayId === day.id
  const dayPointCount = points.filter((p) => p.dayId === day.id).length
  const distanceNm = getDayDistanceNm(day, points, pointOrder)

  let startLabel: string
  let endLabel: string

  if (isActiveSlide && slideState) {
    if (slideState.phase === SlidePhase.PickStart) {
      startLabel = slideState.hoveredPointId
        ? getPointLabel(slideState.hoveredPointId, points, pointOrder)
        : "Click to set start"
      endLabel = getPointLabel(day.endPointId, points, pointOrder)
    } else {
      startLabel = slideState.boundaryPointId
        ? getPointLabel(slideState.boundaryPointId, points, pointOrder)
        : "Click a marker to start"
      endLabel = slideState.hoveredPointId
        ? getPointLabel(slideState.hoveredPointId, points, pointOrder)
        : slideState.boundaryPointId
          ? "Hover a marker to preview"
          : "—"
    }
  } else {
    startLabel = getPointLabel(day.startPointId, points, pointOrder)
    endLabel = getPointLabel(day.endPointId, points, pointOrder)
  }

  const showStartPencil = day.dayNumber > 1 && !isActiveSlide && !!day.startPointId

  return (
    <div
      className="border-b border-border/40 pb-3 mb-3 last:border-b-0 last:mb-0"
      style={{ borderLeftColor: color, borderLeftWidth: 3, paddingLeft: 10 }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">Day {day.dayNumber}</span>
        <div className="flex items-center gap-0.5">
          <button
            aria-label="Reassign day"
            onClick={() => onEditDay(day.id!)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
          >
            <Pencil size={12} />
          </button>
          <button
            aria-label="Delete day"
            onClick={() => onDeleteDay(day.id!)}
            className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-muted"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      <DayDateInput isoValue={day.date} dayId={day.id!} onDateChange={onDateChange} />

      <div className="space-y-1 mb-2">
        <div className="flex gap-2 items-baseline">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground w-10 shrink-0">
            Start
          </span>
          <span className={`text-xs truncate ${isActiveSlide && slideState?.phase === SlidePhase.PickStart ? "text-muted-foreground italic" : "text-foreground"}`}>
            {startLabel}
          </span>
          {showStartPencil && (
            <button
              aria-label="Edit start point"
              onClick={() => onEditDayStart(day.id!)}
              className="text-muted-foreground hover:text-foreground transition-colors ml-0.5 shrink-0"
            >
              <Pencil size={10} />
            </button>
          )}
        </div>
        <div className="flex gap-2 items-baseline">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground w-10 shrink-0">
            End
          </span>
          <span className={`text-xs truncate ${isActiveSlide && slideState?.phase === SlidePhase.PickEnd ? "text-muted-foreground italic" : "text-foreground"}`}>
            {endLabel}
          </span>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground mb-2">
        {formatDistance(distanceNm, distanceUnit)} {distanceUnit}
        {dayPointCount > 0 && ` · ${dayPointCount} pt${dayPointCount !== 1 ? "s" : ""}`}
      </div>

      <div className="flex gap-1.5 mb-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          ~Weather
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          ~Sea
        </span>
      </div>

      {isActiveSlide && (
        <div className="flex gap-1.5">
          <button
            aria-label="Save slide"
            onClick={() => onSaveSlide(day.id!)}
            className="flex-1 text-xs py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Save
          </button>
          <button
            aria-label="Cancel slide"
            onClick={() => onCancelSlide(day.id!)}
            className="flex-1 text-xs py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {dayPointCount > 0 && (
        <div className="mt-2 border-t border-border/30 pt-1">
          {pointOrder
            .filter((id) => points.find((p) => p.id === id)?.dayId === day.id)
            .map((id, idx) => {
              const point = points.find((p) => p.id === id)!
              return (
                <PointAccordionItem
                  key={id}
                  point={point}
                  index={pointOrder.indexOf(id) + 1}
                  isOpen={activePointId === id}
                  onToggle={() => onActivePointChange(activePointId === id ? null : id)}
                  onPointChange={onPointChange}
                  onDelete={() => {}}
                />
              )
            })}
        </div>
      )}
    </div>
  )
}

export function DaySidebar({
  days,
  points,
  pointOrder,
  slideState,
  distanceUnit,
  activePointId,
  onActivePointChange,
  onPointChange,
  onEditDay,
  onEditDayStart,
  onDeleteDay,
  onDateChange,
  onAddDay,
  onSaveSlide,
  onCancelSlide,
}: DaySidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="absolute right-0 top-0 bottom-0 z-[1002] flex items-start">
        <button
          aria-label="Expand days sidebar"
          onClick={() => setCollapsed(false)}
          className="mt-4 bg-background/90 backdrop-blur border border-border/60 rounded-l-md px-2 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shadow-md"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          Days
        </button>
      </div>
    )
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 z-[1002] w-64 flex flex-col">
      <div className="flex-1 bg-background/90 backdrop-blur border-l border-border/60 shadow-lg flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Days
          </span>
          <div className="flex items-center gap-0.5">
            <button
              aria-label="Add day"
              onClick={onAddDay}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
            >
              <Plus size={14} />
            </button>
            <button
              aria-label="Collapse days sidebar"
              onClick={() => setCollapsed(true)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
            >
              ›
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {days.length === 0 ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              Switch to assign days mode to start bracketing your route into days.
            </p>
          ) : (
            days
              .slice()
              .sort((a, b) => a.dayNumber - b.dayNumber)
              .map((day) => (
                <DayCard
                  key={day.id}
                  day={day}
                  points={points}
                  pointOrder={pointOrder}
                  slideState={slideState}
                  distanceUnit={distanceUnit}
                  activePointId={activePointId}
                  onActivePointChange={onActivePointChange}
                  onPointChange={onPointChange}
                  onEditDay={onEditDay}
                  onEditDayStart={onEditDayStart}
                  onDeleteDay={onDeleteDay}
                  onDateChange={onDateChange}
                  onSaveSlide={onSaveSlide}
                  onCancelSlide={onCancelSlide}
                />
              ))
          )}
        </div>
      </div>
    </div>
  )
}
