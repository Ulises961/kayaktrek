"use client"
import { useEffect } from "react"
import type { PointType } from "@/lib/dtos/point"
import { cn } from "@/lib/utils"

const POINT_TYPES: { value: PointType; label: string }[] = [
  { value: "stop", label: "Stop" },
  { value: "position", label: "Position" },
  { value: "interest", label: "Interest" },
]

type PointDropPanelProps = {
  selectedType: PointType
  onTypeChange: (type: PointType) => void
  onOk: () => void
  onUndo: () => void
}

type TypeChipProps = {
  option: { value: PointType; label: string }
  selected: PointType
  onSelect: (type: PointType) => void
}

function TypeChip({ option, selected, onSelect }: TypeChipProps) {
  const handleClick = () => onSelect(option.value)

  return (
    <button
      onClick={handleClick}
      className={cn(
        "px-3 py-1 text-xs rounded-full border transition-colors",
        selected === option.value
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border hover:bg-muted"
      )}
    >
      {option.label}
    </button>
  )
}

export function PointDropPanel({ selectedType, onTypeChange, onOk, onUndo }: PointDropPanelProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOk()
      if (e.key === "Enter") onOk()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onOk])

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-1.5 bg-background/95 backdrop-blur-sm border border-border rounded-full px-3 py-2 shadow-lg">
      {POINT_TYPES.map((opt) => (
        <TypeChip key={opt.value} option={opt} selected={selectedType} onSelect={onTypeChange} />
      ))}
      <div className="w-px h-4 bg-border mx-1" />
      <button
        onClick={onOk}
        className="text-xs text-foreground font-medium hover:text-primary transition-colors px-2"
      >
        OK
      </button>
      <button
        onClick={onUndo}
        className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2"
      >
        Undo
      </button>
    </div>
  )
}
