/**
 * Reinel rose — the artwork on the 404 and 500 pages.
 *
 * A replica of the compass rose on Pedro Reinel's nautical chart of 1504, drawn
 * by Joaquim Alves Gaspar and released CC BY 2.5 (`docs/brand/licences.md`). The
 * `RoseCredit` line rendered under the rose on both error pages is what
 * discharges the attribution term — do not drop it when restyling those pages.
 *
 * Every fill and stroke reads a `--rose-*` custom property (`app/globals.css`),
 * so light/dark and the `adrift` retint are tuned entirely in CSS.
 */
import { cn } from "@/lib/utils"

// The hub sits at the drawing's origin, so the viewBox is written as distances
// out from it and the rotation origin derives from the same four numbers —
// a rose that spins about any other point reads as a broken layout. Deeper above
// than below because only north carries a fleur-de-lys.
const BOX = { left: 300, right: 300, above: 420, below: 300 }
const VIEW_BOX = `${-BOX.left} ${-BOX.above} ${BOX.left + BOX.right} ${BOX.above + BOX.below}`
// `transform-box: view-box` measures from the viewBox's top-left corner, so the
// hub sits at exactly the offsets the box was built from.
const HUB_ORIGIN = `${BOX.left}px ${BOX.above}px`

// One eighth, rotated. Each octant carries a principal point (two mirrored
// halves, one shaded and one sunlit) and one intermediate flourish.
const OCTANTS = [0, 45, 90, 135, 180, 225, 270, 315]

// Rings the original draws in fine line work, inside and outside the points.
const INK_RINGS = [71, 79, 94, 152, 164, 207, 215]

// Half of a principal point, hub to rim. Mirrored across the vertical axis for
// the lit half, which is what gives each point its folded, three-dimensional
// read.
const POINT_HALF =
  "M39.42 95.16c-5.77 8.79-8.66 15.34-10.49 22.02-13.69-3.75-15.39 9.97-5.89 13.82-9.33 14.8-15.2 42.93-23.04 81V103a103 103 0 0 0 39.42-7.84z"

// The intermediate flourish between two principal points.
const LEAF =
  "M-91.11 136.36A164.01 164.01 0 0 0-32 160.85c-15.64 3.54-27.33 4.32-46.84 29.47 3.99-31.58-3.72-40.4-12.28-53.96z"

// Half the fleur-de-lys crowning north; mirrored for the other half.
const FLEUR =
  "M0-215.7v-129.6c2 6 4.6 13.3 6.6 17.6 2.1 4.6 4.6 8 7.5 12.8-2.8 3.9-5.2 7.4-8.1 12.3-2.7 5.7-4.6 12.8-5.8 22.8L0-265.5l4.1-.3c5.8-.5 4.4-14.1 6.2-19.9 1.5-5.3 3.6-10 8.1-12.2 4.1-2.1 9.5-1.7 13.8 0 3.9 1.4 6.8 5.1 9.1 8.6 1.7 2.8 2.6 6.2 2.7 9.5.1 3.2-.4 6.9-2.8 9.8-2.9 3.6-6.2 5-10.8 5.2-1.9-4.7.6-8.9-1.7-11.5-2.2-2.5-7.6-3.7-10.7-2.4-2.9 1.4-3.8 5.6-4.7 8.7-1.2 4.1.3 9.1-2.4 12.5-1.7 2.1-4 2.4-6.6 2.5H0v4.2c0 3.3 5.9 1.5 8.5 3.7 2.2 1.8 1.9 8 4.4 9.4 4 2.2 9.8-1.4 13.8.8 2.9 1.6 4.2 4.9 6 7.7 1.9 2.8 3 5.6 4.2 8.8 1.5 4.3 6.3 17.3.4 9.8-2.2-2.8-6.1-3.8-9-5.9-3.4-2.3-6.4-5-9.9-7.1-2.8-1.7-6.2-2.5-9-4.3L0-233.7v5.1c0 8.2 16 8.2 20.8 14.9 1.9 2.6-6.6-1-9.8-1.2z"

interface ReinelRoseProps {
  // "true" settles onto north — the instrument is fine, the place you asked for
  // is not on the chart. "adrift" hunts for a north it cannot find and drains
  // toward destructive — the instrument is the problem.
  bearing?: "true" | "adrift"
  className?: string
}

export function ReinelRose({ bearing = "true", className }: ReinelRoseProps) {
  return (
    <svg
      viewBox={VIEW_BOX}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn("w-full", bearing === "adrift" && "rose-adrift", className)}
    >
      {/* The motion sits on an inner group rather than the <svg> so it turns
          about the hub, not the element box's centre. */}
      <g
        className={bearing === "adrift" ? "rose-hunt" : "rose-settle"}
        style={{ transformBox: "view-box", transformOrigin: HUB_ORIGIN }}
      >
        {/* Hub — drawn first so the points overlay it, as in the original. */}
        <circle r="8" fill="var(--rose-ink)" stroke="var(--rose-north)" strokeWidth="0.4" />

        <g fill="none">
          {/* The two heavy rings carrying the rose's second colour. */}
          <g stroke="var(--rose-ring)" strokeWidth="8">
            <circle r="75" />
            <circle r="211" />
          </g>
          <g stroke="var(--rose-ink)">
            {INK_RINGS.map((radius) => (
              <circle key={radius} r={radius} />
            ))}
          </g>
        </g>

        {OCTANTS.map((degrees) => (
          <g key={degrees} transform={`rotate(${degrees})`}>
            <path d={POINT_HALF} fill="var(--rose-ink)" stroke="var(--rose-ink)" />
            <path
              d={POINT_HALF}
              fill="var(--rose-lit)"
              stroke="var(--rose-ink)"
              transform="scale(-1 1)"
            />
            <path d={LEAF} fill="var(--rose-leaf)" stroke="var(--rose-ink)" />
          </g>
        ))}

        {/* Fleur-de-lys, one half mirrored onto the other. */}
        {[1, -1].map((side) => (
          <g
            key={side}
            transform={side === -1 ? "scale(-1 1)" : undefined}
            fill="var(--rose-north-mark)"
            stroke="var(--rose-ink)"
          >
            <path d={FLEUR} fill="var(--rose-north)" strokeWidth="0.7" />
            <circle r="8" cx="37.2" cy="-248.2" />
            <circle r="8" cx="27.9" cy="-312.7" />
          </g>
        ))}
        <circle r="8" cy="-360" fill="var(--rose-north-mark)" stroke="var(--rose-ink)" />
      </g>
    </svg>
  )
}
