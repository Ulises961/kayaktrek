"use client"
import { useState } from "react"
import { TrashIcon, AnchorIcon, CircleDotIcon, StarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Point, PointType } from "@/lib/dtos/point"

export type PointRowProps = {
  point: Point
  index: number
  isExpanded: boolean
  onExpand: (id: string) => void
  isBoundary: boolean
  dayColor: string
  onTypeChange?: (type: PointType) => void
  onNameChange?: (name: string) => void
  onNameBlur?: (name: string) => void
  onDelete?: () => void
}

const TYPE_OPTIONS: { type: PointType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "stop", label: "Stop", Icon: AnchorIcon },
  { type: "position", label: "Position", Icon: CircleDotIcon },
  { type: "interest", label: "Interest", Icon: StarIcon },
]

export function PointRow({
  point,
  index,
  isExpanded,
  onExpand,
  isBoundary,
  dayColor,
  onTypeChange,
  onNameChange,
  onNameBlur,
  onDelete,
}: PointRowProps) {
  const [localName, setLocalName] = useState(point.name ?? "")
  const label = point.name || null
  const typeConfig = TYPE_OPTIONS.find((o) => o.type === (point.type ?? "position")) ?? TYPE_OPTIONS[1]
  const TypeIcon = typeConfig.Icon

  if (!isExpanded) {
    return (
      <button
        type="button"
        data-testid="point-row"
        className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
        onClick={() => point.id && onExpand(point.id)}
      >
        <span className="w-1 h-4 rounded-sm shrink-0" style={{ backgroundColor: dayColor }} />
        <span className="text-[10px] tabular-nums text-muted-foreground w-4 shrink-0 text-right">{index}</span>
        <TypeIcon className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground shrink-0">{typeConfig.label}</span>
        {label && <span className="flex-1 truncate text-foreground ml-0.5">{label}</span>}
      </button>
    )
  }

  return (
    <div data-testid="point-row" className="flex flex-col px-3 py-2 gap-2 bg-muted/30 border-b border-border">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="w-1 h-4 rounded-sm shrink-0" style={{ backgroundColor: dayColor }} />
        <TypeIcon className="size-3.5 text-muted-foreground shrink-0" />
        {label
          ? <span className="flex-1 truncate">{label}</span>
          : <span className="flex-1 truncate text-muted-foreground">{typeConfig.label} {index}</span>
        }
      </div>

      {!isBoundary && onTypeChange && (
        <div className="flex gap-1">
          {TYPE_OPTIONS.map(({ type, label: typeLabel, Icon }) => (
            <button
              key={type}
              type="button"
              className={cn(
                "flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors",
                point.type === type
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted border-border"
              )}
              onClick={() => onTypeChange(type)}
            >
              <Icon className="size-3.5" />
              <span>{typeLabel}</span>
            </button>
          ))}
        </div>
      )}

      {onNameChange && (
        <input
          type="text"
          className="w-full text-sm rounded border border-border bg-background px-2 py-1"
          placeholder="Point name"
          value={localName}
          onChange={(e) => {
            setLocalName(e.target.value)
            onNameChange(e.target.value)
          }}
          onBlur={() => onNameBlur?.(localName)}
        />
      )}

      {onDelete && (
        <button
          type="button"
          aria-label="Delete point"
          className="flex items-center gap-1 text-xs text-destructive hover:text-destructive/80 self-start"
          onClick={onDelete}
        >
          <TrashIcon className="size-3.5" />
          <span>Delete</span>
        </button>
      )}
    </div>
  )
}
