import { cn } from "@/lib/utils"

export type VisualState = "empty" | "loading" | "not-found" | "error" | "success"

interface StateVisualProps {
  state: VisualState
  className?: string
}

// ── Layout constants ─────────────────────────────────────────────────────────

const H = 210 // horizon y
const ROUTE = "M 72 192 Q 160 168 240 186 Q 320 204 408 186"

// ── Shared primitives ─────────────────────────────────────────────────────────

function Horizon({ tilted }: { tilted?: boolean }) {
  if (tilted) {
    // Static tilt encoded in coordinates — disruption via CSS on a wrapping <g>
    return (
      <g style={{ animation: "sv-disrupt 0.9s ease-in-out infinite" }}>
        <line x1="-10" y1={H - 6} x2="490" y2={H + 6}
          stroke="var(--border)" strokeWidth="1" strokeDasharray="8 10" />
      </g>
    )
  }
  return (
    <line x1="0" y1={H} x2="480" y2={H}
      stroke="var(--border)" strokeWidth="1" strokeDasharray="8 10" />
  )
}

function Sea() {
  return (
    <>
      <rect x="0" y={H} width="480" height={400 - H} fill="var(--secondary)" opacity="0.35" />
      <path
        d={`M0 ${H + 14} Q60 ${H + 6} 120 ${H + 14} Q180 ${H + 22} 240 ${H + 14} Q300 ${H + 6} 360 ${H + 14} Q420 ${H + 22} 480 ${H + 14}`}
        stroke="var(--foam)" strokeWidth="1" fill="none" opacity="0.30"
      />
      <path
        d={`M0 ${H + 32} Q80 ${H + 24} 160 ${H + 32} Q240 ${H + 40} 320 ${H + 32} Q400 ${H + 24} 480 ${H + 32}`}
        stroke="var(--foam)" strokeWidth="0.8" fill="none" opacity="0.18"
      />
    </>
  )
}

// Compass with cardinal ticks and a north needle.
// `disrupted` makes the needle oscillate erratically via CSS animation.
function Compass({ cx, cy, r = 26, disrupted }: { cx: number; cy: number; r?: number; disrupted?: boolean }) {
  const ticks = [0, 90, 180, 270] // degrees from east in SVG coord space
  return (
    <g>
      <circle cx={cx} cy={cy} r={r}
        stroke="var(--muted-foreground)" strokeWidth="1" fill="none" opacity="0.22" />
      {ticks.map((deg) => {
        const rad = (deg * Math.PI) / 180
        const isNorth = deg === 270
        return (
          <line key={deg}
            x1={cx + Math.cos(rad) * (r - (isNorth ? 7 : 5))}
            y1={cy + Math.sin(rad) * (r - (isNorth ? 7 : 5))}
            x2={cx + Math.cos(rad) * r}
            y2={cy + Math.sin(rad) * r}
            stroke="var(--muted-foreground)"
            strokeWidth={isNorth ? 1.8 : 1}
            opacity={isNorth ? 0.55 : 0.28}
          />
        )
      })}
      <circle cx={cx} cy={cy} r={2} fill="var(--muted-foreground)" opacity="0.35" />
      {/* North needle — triangle pointing toward north tick */}
      <path
        d={`M${cx} ${cy - r + 5} L${cx - 3.5} ${cy + 3} L${cx + 3.5} ${cy + 3} Z`}
        fill="var(--accent)"
        opacity="0.65"
        style={disrupted ? {
          animation: "sv-needle 1.6s ease-in-out infinite",
          transformOrigin: `${cx}px ${cy}px`,
        } : undefined}
      />
    </g>
  )
}

// Waypoint marker: filled dot with an outer ring.
// `faded` = destination that should exist but doesn't (404 ghost node).
// `pulse` = emits a slow expanding ring (active / just placed).
function Waypoint({ cx, cy, faded, pulse }: { cx: number; cy: number; faded?: boolean; pulse?: boolean }) {
  const op = faded ? 0.18 : 0.85
  return (
    <g>
      {pulse && (
        <circle cx={cx} cy={cy} r={8} stroke="var(--accent)" strokeWidth="1" fill="none">
          <animate attributeName="r" values="7;18;7" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
      {faded && (
        <circle cx={cx} cy={cy} r={6}
          stroke="var(--muted-foreground)" strokeWidth="1"
          fill="none" opacity="0.2" strokeDasharray="2 2" />
      )}
      <circle cx={cx} cy={cy} r={4} fill="var(--accent)" opacity={op} />
    </g>
  )
}

// Route path — dashed by default, broken = gap with misaligned second half.
function Route({ broken, solid, opacity = 0.45 }: { broken?: boolean; solid?: boolean; opacity?: number }) {
  const dash = solid ? undefined : "6 4"
  if (broken) {
    return (
      <>
        <path d="M 72 192 Q 132 174 168 182"
          stroke="var(--muted-foreground)" strokeWidth="1.5"
          strokeDasharray="6 4" fill="none" opacity={opacity} />
        <g style={{ animation: "sv-disrupt 1.1s ease-in-out infinite" }}>
          <path d="M 212 194 Q 310 206 408 186"
            stroke="var(--muted-foreground)" strokeWidth="1.5"
            strokeDasharray="6 4" fill="none" opacity={opacity} />
        </g>
      </>
    )
  }
  return (
    <path d={ROUTE}
      stroke={solid ? "var(--accent)" : "var(--muted-foreground)"}
      strokeWidth="1.5"
      strokeDasharray={dash}
      fill="none"
      opacity={opacity}
    />
  )
}

// Node that follows ROUTE using native SVG SMIL — no Framer, no offset-path.
function TrackingNode() {
  return (
    <circle r={4.5} fill="var(--accent)" opacity={0.9}>
      <animateMotion dur="2.8s" repeatCount="indefinite" path={ROUTE}
        calcMode="spline" keyTimes="0;1" keySplines="0.42 0 0.58 1" />
    </circle>
  )
}

// Simplified paddle: shaft line + two blade ellipses.
// Abstracted geometry, immediately recognisable to a kayaker.
function Paddle({ cy = 178, opacity = 0.45 }: { cy?: number; opacity?: number }) {
  return (
    <g opacity={opacity}>
      {/* Shaft */}
      <line x1="110" y1={cy} x2="370" y2={cy}
        stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      {/* Left blade */}
      <ellipse cx="92" cy={cy} rx="24" ry="10"
        fill="var(--accent)"
        transform={`rotate(-10, 92, ${cy})`} />
      {/* Left blade highlight */}
      <ellipse cx="92" cy={cy} rx="16" ry="6"
        fill="none" stroke="var(--background)" strokeWidth="1" opacity="0.3"
        transform={`rotate(-10, 92, ${cy})`} />
      {/* Right blade */}
      <ellipse cx="388" cy={cy} rx="24" ry="10"
        fill="var(--accent)"
        transform={`rotate(10, 388, ${cy})`} />
      {/* Right blade highlight */}
      <ellipse cx="388" cy={cy} rx="16" ry="6"
        fill="none" stroke="var(--background)" strokeWidth="1" opacity="0.3"
        transform={`rotate(10, 388, ${cy})`} />
    </g>
  )
}

// ── Scenes ───────────────────────────────────────────────────────────────────

// Empty: paddle waiting, one waypoint to define, horizon open.
// Reads as: "your equipment is ready — set your first destination."
function EmptyScene() {
  return (
    <>
      <Compass cx={68} cy={90} r={24} />
      <g style={{ animation: "sv-oscillate 4s ease-in-out infinite" }}>
        <Paddle cy={176} opacity={0.42} />
      </g>
      <Horizon />
      <Sea />
      <g style={{ animation: "sv-oscillate 3.2s ease-in-out infinite 0.8s" }}>
        <Waypoint cx={240} cy={192} pulse />
      </g>
      {/* Open-ended dashed path — potential, not yet defined */}
      <path d="M 240 192 Q 318 172 410 180"
        stroke="var(--muted-foreground)" strokeWidth="1.2"
        strokeDasharray="3 7" fill="none" opacity="0.18" />
    </>
  )
}

// Loading: node tracking a route — navigating toward something.
function LoadingScene() {
  return (
    <>
      <Horizon />
      <Sea />
      <Waypoint cx={72} cy={192} />
      <Waypoint cx={240} cy={186} />
      <Waypoint cx={408} cy={186} />
      <Route opacity={0.30} />
      <TrackingNode />
    </>
  )
}

// Not-found: route planned, destination absent — the last node simply doesn't exist.
function NotFoundScene() {
  return (
    <>
      <Compass cx={68} cy={86} r={22} />
      <Horizon />
      <Sea />
      <Waypoint cx={96} cy={194} />
      <Waypoint cx={228} cy={176} />
      <Waypoint cx={348} cy={192} />
      {/* Ghost node — expected position, nothing there */}
      <Waypoint cx={412} cy={183} faded />
      <Route opacity={0.42} />
      {/* Path dissolves past last confirmed waypoint */}
      <path d="M 348 192 Q 382 180 422 182"
        stroke="var(--muted-foreground)" strokeWidth="1.2"
        strokeDasharray="2 6" fill="none" opacity="0.16" />
    </>
  )
}

// Error: compass lost, horizon breaks, route cannot be resolved.
function ErrorScene() {
  return (
    <>
      <Compass cx={68} cy={86} r={22} disrupted />
      <Horizon tilted />
      <Sea />
      <Waypoint cx={72} cy={196} />
      <Waypoint cx={408} cy={186} faded />
      <Route broken opacity={0.48} />
      {/* Break mark at gap */}
      <g style={{ animation: "sv-disrupt 0.8s ease-in-out infinite" }}>
        <line x1="182" y1="179" x2="196" y2="193"
          stroke="var(--destructive)" strokeWidth="2" opacity="0.72" />
        <line x1="196" y1="179" x2="182" y2="193"
          stroke="var(--destructive)" strokeWidth="2" opacity="0.72" />
      </g>
    </>
  )
}

// Success: route resolved, compass true north, flag planted, sun on the horizon.
function SuccessScene() {
  return (
    <>
      <Compass cx={68} cy={86} r={22} />
      {/* Sun — destination reached, clear day */}
      <circle cx={410} cy={88} r={38} fill="var(--accent)" opacity="0.12" />
      <circle cx={410} cy={88} r={22} fill="var(--accent)" opacity="0.40" />
      <Horizon />
      <Sea />
      <Route solid opacity={0.52} />
      <Waypoint cx={72} cy={192} />
      <Waypoint cx={180} cy={175} />
      <Waypoint cx={300} cy={194} />
      <Waypoint cx={408} cy={180} />
      {/* Flag at destination */}
      <line x1="408" y1="180" x2="408" y2="150"
        stroke="var(--accent)" strokeWidth="1.5" opacity="0.65" />
      <path d="M 408 150 L 430 158 L 408 166 Z"
        fill="var(--accent)" opacity="0.65" />
    </>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export function StateVisual({ state, className }: StateVisualProps) {
  return (
    <svg
      viewBox="0 0 480 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full", className)}
      aria-hidden="true"
    >
      <rect width="480" height="400" fill="var(--background)" />
      {state === "empty"     && <EmptyScene />}
      {state === "loading"   && <LoadingScene />}
      {state === "not-found" && <NotFoundScene />}
      {state === "error"     && <ErrorScene />}
      {state === "success"   && <SuccessScene />}
    </svg>
  )
}
