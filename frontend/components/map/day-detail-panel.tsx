"use client"
import { Anchor, Star, CircleDot } from "lucide-react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
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

export function DayDetailPanel() {
  const { state, selectedDayId, setSelectedPointId } = useMapBuilder()

  if (!selectedDayId) return null

  const dayPoints = state.pointOrder
    .map((id) => state.points.find((p) => p.id === id))
    .filter((p): p is Point => p !== undefined && p.dayId === selectedDayId)

  return (
    <div className="bg-background/95 border-t border-border py-2">
      <Carousel opts={{ align: "start", dragFree: true }}>
        <CarouselContent className="-ml-2 px-3">
          {dayPoints.map((point) => {
            const globalIdx = state.pointOrder.indexOf(point.id!) + 1
            return (
              <CarouselItem key={point.id} className="pl-2 basis-auto h-18">
                <PointCard
                  point={point}
                  index={globalIdx}
                  onOpen={setSelectedPointId}
                />
              </CarouselItem>
            )
          })}
        </CarouselContent>
      </Carousel>
    </div>
  )
}
