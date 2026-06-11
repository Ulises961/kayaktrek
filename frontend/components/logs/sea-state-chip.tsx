import { cn } from "@/lib/utils"

interface Band {
  max: number
  label: string
  style: string
}

const BANDS: Band[] = [
  {
    max: 1,
    label: "Calm",
    style: "bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400",
  },
  {
    max: 3,
    label: "Light",
    style: "bg-sky-100    text-sky-700    dark:bg-sky-900/30    dark:text-sky-400",
  },
  {
    max: 5,
    label: "Moderate",
    style: "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-400",
  },
  {
    max: 8,
    label: "Rough",
    style: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  },
  {
    max: 12,
    label: "Storm",
    style: "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400",
  },
]

function getBand(value: number): Band {
  return BANDS.find((b) => value <= b.max) ?? BANDS[BANDS.length - 1]
}

interface SeaStateChipProps {
  value: number | null | undefined
  className?: string
}

export function SeaStateChip({ value, className }: SeaStateChipProps) {
  if (value == null) return null
  const band = getBand(value)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[3px] border border-current px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] uppercase opacity-90",
        band.style,
        className,
      )}
    >
      B{value} · {band.label}
    </span>
  )
}
