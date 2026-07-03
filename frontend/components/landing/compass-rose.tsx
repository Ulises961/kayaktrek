/**
 * Compass rose — the brand mark. An 8-point star with an amber north point
 * and a needle that settles to north on load (see .chart-needle keyframes).
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
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <circle cx="24" cy="24" r="22" stroke={palette.ocean700} strokeWidth="1.2" opacity="0.55" />
      <circle cx="24" cy="24" r="16" stroke={palette.ocean700} strokeWidth="0.8" opacity="0.3" />
      {/* Cardinal star — long points */}
      <path d="M24 3 L27 24 L24 24 Z" fill={palette.ocean900} />
      <path d="M24 45 L21 24 L24 24 Z" fill={palette.ocean700} opacity="0.7" />
      <path d="M3 24 L24 21 L24 24 Z" fill={palette.ocean700} opacity="0.7" />
      <path d="M45 24 L24 27 L24 24 Z" fill={palette.ocean700} opacity="0.7" />
      {/* Intercardinal — short points */}
      <g opacity="0.45" fill={palette.ocean500}>
        <path d="M38 10 L25 23 L26 24 Z" />
        <path d="M10 38 L23 25 L22 24 Z" />
        <path d="M38 38 L25 25 L24 26 Z" />
        <path d="M10 10 L23 23 L24 22 Z" />
      </g>
      {/* North needle — settles on load */}
      <g className="chart-needle">
        <path d="M24 6 L26.4 24 L21.6 24 Z" fill={palette.sunset500} />
        <circle cx="24" cy="24" r="2.4" fill={palette.ocean900} />
      </g>
    </svg>
  )
}
