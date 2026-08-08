/**
 * A navy chart rose with an amber core, settling into true north on load (see
 * the .chart-needle keyframes in globals.css).
 *
 * The geometry is Phosphor Icons' `compass-rose` (duotone), MIT licensed — see
 * `docs/brand/licences.md` for the notice. Only the colours are ours: the two
 * duotone layers are driven from the design tokens rather than `currentColor`.
 *
 * This was the brand mark until `components/common/brand-mark.tsx` took over.
 * Its enclosing ring reads as a crosshair at header size — the amber duotone
 * layer shows through the quadrant gaps as a plus sign — and its `ocean900`
 * line work is the same colour as the dark-mode background, so it disappeared
 * in the dark app-shell header. It renders on the `/design` showcase only.
 */
import { palette } from "@/lib/tokens"

type Props = {
  size?: number
  className?: string
}

export function CompassRose({ size = 28, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      {/* Whole mark settles, rather than a needle within it — this rose has no
          separable needle. Same keyframes, same reduced-motion opt-out. */}
      <g className="chart-needle">
        {/* Core star — the warm centre, carrying the north accent. */}
        <path
          d="M248,128l-96,24-24,96-24-96L8,128l96-24L128,8l24,96Z"
          fill={palette.sunset500}
          opacity="0.55"
        />
        {/* Engraved rose — the navy line work. */}
        <path
          d="M249.94,120.24l-27.05-6.76a95.86,95.86,0,0,0-80.37-80.37l-6.76-27a8,8,0,0,0-15.52,0l-6.76,27.05a95.86,95.86,0,0,0-80.37,80.37l-27,6.76a8,8,0,0,0,0,15.52l27.05,6.76a95.86,95.86,0,0,0,80.37,80.37l6.76,27.05a8,8,0,0,0,15.52,0l6.76-27.05a95.86,95.86,0,0,0,80.37-80.37l27.05-6.76a8,8,0,0,0,0-15.52Zm-95.49,22.9L139.31,128l15.14-15.14L215,128Zm-52.9,0L41,128l60.57-15.14L116.69,128ZM205.77,109.2,158.6,97.4,146.8,50.23A79.88,79.88,0,0,1,205.77,109.2Zm-62.63-7.65L128,116.69l-15.14-15.14L128,41ZM109.2,50.23,97.4,97.4,50.23,109.2A79.88,79.88,0,0,1,109.2,50.23Zm-59,96.57L97.4,158.6l11.8,47.17A79.88,79.88,0,0,1,50.23,146.8Zm62.63,7.65L128,139.31l15.14,15.14L128,215Zm33.94,51.32,11.8-47.17,47.17-11.8A79.88,79.88,0,0,1,146.8,205.77Z"
          fill={palette.ocean900}
        />
      </g>
    </svg>
  )
}
