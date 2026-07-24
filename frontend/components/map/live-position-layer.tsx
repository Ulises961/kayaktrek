"use client"

import { CircleMarker, Tooltip } from "react-leaflet"
import type { LivePosition } from "@/lib/dtos/live-position"
import { formatMinutesAgo, minutesSince } from "@/lib/utils/date"
import { palette } from "@/lib/tokens"

const STALE_AFTER_MINUTES = 10

type Props = {
  positions: LivePosition[]
  // Injectable for tests; defaults to the real current time.
  now?: Date
}

export function LivePositionLayer({ positions, now }: Props) {
  return (
    <>
      {positions.map((position) => {
        const stale = minutesSince(position.recordedAt, now) > STALE_AFTER_MINUTES
        return (
          <CircleMarker
            key={position.userId}
            center={[position.lat, position.lon]}
            radius={7}
            pathOptions={{
              color: palette.red600,
              fillColor: palette.red600,
              fillOpacity: stale ? 0.35 : 0.9,
              opacity: stale ? 0.35 : 0.9,
              weight: 2,
            }}
          >
            <Tooltip>
              {position.name} · {formatMinutesAgo(position.recordedAt, now)}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
