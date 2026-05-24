"use client"
import { useEffect, useRef, useState } from "react"
import type { Point } from "@/lib/dtos/point"
import { PointAccordionItem } from "./point-accordion-item"

type DropSidebarProps = {
  points: Point[]
  pointOrder: string[]
  activePointId: string | null
  onActivePointChange: (id: string | null) => void
  onPointChange: (id: string, fields: Partial<Point>) => void
  onPointDelete: (id: string) => void
  onFetchPois: (point: Point) => Promise<void>
  poiResults: Point[]
  onPoiSelect: (pointId: string, name: string) => void
}

export function DropSidebar({
  points,
  pointOrder,
  activePointId,
  onActivePointChange,
  onPointChange,
  onPointDelete,
  onFetchPois,
  poiResults,
  onPoiSelect,
}: DropSidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const activeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (activePointId && activeRef.current?.scrollIntoView) {
      activeRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [activePointId])

  const orderedPoints = pointOrder
    .map((id) => points.find((p) => p.id === id))
    .filter((p): p is Point => p !== undefined)

  if (collapsed) {
    return (
      <div className="absolute left-0 top-0 bottom-0 z-[1002] flex items-start">
        <button
          aria-label="Show points"
          onClick={() => setCollapsed(false)}
          className="mt-4 bg-background/90 backdrop-blur border border-border/60 rounded-r-md px-2 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shadow-md"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          Points
        </button>
      </div>
    )
  }

  return (
    <div className="absolute left-0 top-0 bottom-0 z-[1002] w-56 flex flex-col">
      <div className="flex-1 bg-background/90 backdrop-blur border-r border-border/60 shadow-lg flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Points
          </span>
          <button
            aria-label="Collapse points sidebar"
            onClick={() => setCollapsed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
          >
            ‹
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-1">
          {orderedPoints.length === 0 ? (
            <p className="text-xs text-muted-foreground leading-relaxed py-2">
              Click on the map to drop points along your route.
            </p>
          ) : (
            orderedPoints.map((point, idx) => {
              const isActive = activePointId === point.id
              return (
                <div key={point.id} ref={isActive ? activeRef : null}>
                  <PointAccordionItem
                    point={point}
                    index={idx + 1}
                    isOpen={isActive}
                    onToggle={() => onActivePointChange(isActive ? null : point.id!)}
                    onPointChange={onPointChange}
                    onDelete={onPointDelete}
                    onFetchPois={point.type === "interest" ? () => onFetchPois(point) : undefined}
                    poiResults={isActive && point.type === "interest" ? poiResults : []}
                    onPoiSelect={(name) => onPoiSelect(point.id!, name)}
                  />
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
