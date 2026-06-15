import { AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { degreesToCompass } from "@/lib/weather/beaufort"
import { formatHour } from "@/lib/weather/hourly"
import type { TidalGateWarning } from "@/lib/dtos/tidal-station"

interface TidalGateWarningsProps {
  gates: TidalGateWarning[]
}

function slackLabel(utc: string | null | undefined): string | null {
  if (!utc) return null
  // accept either an ISO timestamp or a plain HH:MM[:SS]
  const timePart = utc.includes("T") ? (utc.split("T")[1] ?? "") : utc
  const hhmm = formatHour(timePart)
  return hhmm === "—" ? null : `next slack ${hhmm} UTC`
}

export function TidalGateWarnings({ gates }: TidalGateWarningsProps) {
  if (gates.length === 0) return null

  return (
    <ul className="flex flex-col gap-1.5" data-testid="tidal-gate-warnings">
      {gates.map((gate, i) => {
        const slack = slackLabel(gate.nextSlackUtc)
        return (
          <li
            key={`${gate.pointId}-${i}`}
            data-blocking={gate.isBlocking ? "true" : undefined}
            className={cn(
              "flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs",
              gate.isBlocking
                ? "border-orange-300 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/30"
                : "border-border bg-muted/40",
            )}
          >
            {gate.isBlocking ? (
              <AlertTriangle
                className="mt-0.5 size-3.5 shrink-0 text-orange-600 dark:text-orange-400"
                aria-hidden
              />
            ) : (
              <Info className="text-muted-foreground mt-0.5 size-3.5 shrink-0" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="text-foreground font-medium">{gate.stationName}</span>{" "}
              <span className="text-muted-foreground">
                {gate.rateKnots.toFixed(1)} kn
                {gate.directionDegrees != null && ` ${degreesToCompass(gate.directionDegrees)}`}
                {slack && ` · ${slack}`}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
