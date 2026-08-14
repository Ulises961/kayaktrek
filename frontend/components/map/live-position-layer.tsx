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
            // Foam is the live/motion role colour, so the thing that is literally live
            // wears it. It used to be red600 — the destructive colour, the same hue as
            // Abort expedition — which put a warning on a paddler doing nothing wrong.
            //
            // The ink ring is what makes that affordable. Red's advantage was separating
            // from pale chart water by hue alone; a ring separates by value instead, and
            // value survives both the blue of open water and the beige of the coast. So
            // the fill is free to carry meaning while the ring carries the contrast.
            pathOptions={{
              color: palette.ocean900,
              fillColor: palette.foam400,
              fillOpacity: stale ? 0.35 : 0.9,
              opacity: stale ? 0.45 : 1,
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
