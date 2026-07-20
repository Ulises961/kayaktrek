"use client"
import { useState } from "react"
import { TrashIcon, AnchorIcon, CircleDotIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Point, PointType } from "@/lib/dtos/point"
import type { SaveStatus } from "@/hooks/use-save-status"
import { SaveStatusLine } from "@/components/common/save-status-line"

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
  saveStatus?: SaveStatus
  onDelete?: () => void
}

const TYPE_OPTIONS: {
  type: PointType
  label: string
  Icon: React.ComponentType<{ className?: string }>
}[] = [
  { type: "stop", label: "Stop", Icon: AnchorIcon },
  { type: "position", label: "Position", Icon: CircleDotIcon },
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
  saveStatus = "idle",
  onDelete,
}: PointRowProps) {
  const [localName, setLocalName] = useState(point.name ?? "")
  const label = point.name || null
  const typeConfig =
    TYPE_OPTIONS.find((o) => o.type === (point.type ?? "position")) ?? TYPE_OPTIONS[1]
  const TypeIcon = typeConfig.Icon

  if (!isExpanded) {
    return (
      <button
        type="button"
        data-testid="point-row"
        className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
        onClick={() => point.id && onExpand(point.id)}
      >
        <span className="h-4 w-1 shrink-0 rounded-sm" style={{ backgroundColor: dayColor }} />
        <span className="text-muted-foreground w-4 shrink-0 text-right text-[10px] tabular-nums">
          {index}
        </span>
        <TypeIcon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="text-muted-foreground shrink-0 text-xs">{typeConfig.label}</span>
        {label && <span className="text-foreground ml-0.5 flex-1 truncate">{label}</span>}
      </button>
    )
  }

  return (
    <div
      data-testid="point-row"
      className="bg-muted/30 border-border flex flex-col gap-2 border-b px-3 py-2"
    >
      <button
        type="button"
        aria-expanded
        aria-label="Collapse point"
        className="flex items-center gap-2 text-left text-sm font-medium"
        onClick={() => point.id && onExpand(point.id)}
      >
        <span className="h-4 w-1 shrink-0 rounded-sm" style={{ backgroundColor: dayColor }} />
        <TypeIcon className="text-muted-foreground size-3.5 shrink-0" />
        {label ? (
          <span className="flex-1 truncate">{label}</span>
        ) : (
          <span className="text-muted-foreground flex-1 truncate">
            {typeConfig.label} {index}
          </span>
        )}
      </button>

      {!isBoundary && onTypeChange && (
        <div className="flex gap-1">
          {TYPE_OPTIONS.map(({ type, label: typeLabel, Icon }) => (
            <button
              key={type}
              type="button"
              className={cn(
                "flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors",
                point.type === type
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted border-border",
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
        <div className="flex flex-col gap-1">
          <input
            type="text"
            className="border-border bg-background w-full rounded border px-2 py-1 text-sm"
            placeholder="Point name"
            value={localName}
            onChange={(e) => {
              setLocalName(e.target.value)
              onNameChange(e.target.value)
            }}
            onBlur={() => onNameBlur?.(localName)}
          />
          <SaveStatusLine status={saveStatus} />
        </div>
      )}

      {onDelete && (
        <button
          type="button"
          aria-label="Delete point"
          className="text-destructive hover:text-destructive/80 flex items-center gap-1 self-start text-xs"
          onClick={onDelete}
        >
          <TrashIcon className="size-3.5" />
          <span>Delete</span>
        </button>
      )}
    </div>
  )
}
