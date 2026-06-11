"use client"
import { useMemo } from "react"
import { useMapBuilder } from "@/lib/itinerary/map-builder-context"
import { haversineNm } from "@/lib/itinerary/distance"
import { DayStripCard } from "./day-strip-card"
import { DayDetailPanel } from "./day-detail-panel"
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel"
import type { Point } from "@/lib/dtos/point"

function dayDistanceNm(dayId: string, points: Point[], pointOrder: string[]): number {
  const ordered = pointOrder
    .map((id) => points.find((p) => p.id === id))
    .filter(
      (p): p is Point & { latitude: number; longitude: number } =>
        p !== undefined && p.dayId === dayId && p.latitude != null && p.longitude != null,
    )
  let total = 0
  for (let i = 0; i < ordered.length - 1; i++) {
    total += haversineNm(ordered[i], ordered[i + 1])
  }
  return total
}

export function DayStrip() {
  const { state, distanceUnit, avgSpeedKnots, selectedDayId, setSelectedDayId, tripState } =
    useMapBuilder()

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const numberedDays = useMemo(
    () => [...state.days].filter((d) => d.dayNumber > 0).sort((a, b) => a.dayNumber - b.dayNumber),
    [state.days],
  )

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[1001] flex flex-col">
      {selectedDayId && <DayDetailPanel />}

      <div className="bg-background/90 border-border border-t py-2 backdrop-blur-sm">
        <Carousel opts={{ align: "start", dragFree: true }}>
          <CarouselContent className="-ml-2 px-3">
            {numberedDays.map((day) => {
              const dist = dayDistanceNm(day.id!, state.points, state.pointOrder)
              const isToday = tripState === "happening" && !!day.date && day.date === today
              const isPastDay =
                tripState === "past" ||
                (tripState === "happening" && !!day.date && day.date < today)

              return (
                <CarouselItem key={day.id} className="basis-auto pl-2">
                  <DayStripCard
                    dayId={day.id!}
                    dayNumber={day.dayNumber}
                    date={day.date ?? null}
                    distanceNm={dist}
                    avgSpeedKnots={avgSpeedKnots}
                    distanceUnit={distanceUnit}
                    isSelected={selectedDayId === day.id}
                    isToday={isToday}
                    isPastDay={isPastDay}
                    onClick={() => setSelectedDayId(selectedDayId === day.id ? null : day.id!)}
                  />
                </CarouselItem>
              )
            })}
          </CarouselContent>
        </Carousel>
      </div>
    </div>
  )
}
