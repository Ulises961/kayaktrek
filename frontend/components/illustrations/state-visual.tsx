import { cn } from "@/lib/utils"
import { ReinelRose } from "@/components/illustrations/reinel-rose"

export type VisualState = "empty" | "loading" | "not-found" | "error" | "success"

interface StateVisualProps {
  state: VisualState
  className?: string
}

// ── Layout constants ─────────────────────────────────────────────────────────

const H = 210 // horizon y
const ROUTE = "M 72 192 Q 160 168 240 186 Q 320 204 408 186"

// ── Shared primitives ─────────────────────────────────────────────────────────

function Horizon() {
  return (
    <line
      x1="0"
      y1={H}
      x2="480"
      y2={H}
      stroke="var(--border)"
      strokeWidth="1"
      strokeDasharray="8 10"
    />
  )
}

function Sea() {
  return (
    <>
      <rect x="0" y={H} width="480" height={400 - H} fill="var(--secondary)" opacity="0.35" />
      <path
        d={`M0 ${H + 14} Q60 ${H + 6} 120 ${H + 14} Q180 ${H + 22} 240 ${H + 14} Q300 ${H + 6} 360 ${H + 14} Q420 ${H + 22} 480 ${H + 14}`}
        stroke="var(--foam)"
        strokeWidth="1"
        fill="none"
        opacity="0.30"
      />
      <path
        d={`M0 ${H + 32} Q80 ${H + 24} 160 ${H + 32} Q240 ${H + 40} 320 ${H + 32} Q400 ${H + 24} 480 ${H + 32}`}
        stroke="var(--foam)"
        strokeWidth="0.8"
        fill="none"
        opacity="0.18"
      />
    </>
  )
}

// Compass with cardinal ticks and a north needle.
function Compass({ cx, cy, r = 26 }: { cx: number; cy: number; r?: number }) {
  const ticks = [0, 90, 180, 270] // degrees from east in SVG coord space
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke="var(--muted-foreground)"
        strokeWidth="1"
        fill="none"
        opacity="0.22"
      />
      {ticks.map((deg) => {
        const rad = (deg * Math.PI) / 180
        const isNorth = deg === 270
        return (
          <line
            key={deg}
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
        fill="var(--illus-accent)"
        opacity="0.65"
      />
    </g>
  )
}

// Waypoint marker: filled dot with an outer ring.
// `pulse` = emits a slow expanding ring (active / just placed).
function Waypoint({ cx, cy, pulse }: { cx: number; cy: number; pulse?: boolean }) {
  return (
    <g>
      {pulse && (
        <circle cx={cx} cy={cy} r={8} stroke="var(--illus-accent)" strokeWidth="1" fill="none">
          <animate attributeName="r" values="7;18;7" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy} r={4} fill="var(--illus-accent)" opacity={0.85} />
    </g>
  )
}

// Route path — dashed by default, solid once resolved.
function Route({ solid, opacity = 0.45 }: { solid?: boolean; opacity?: number }) {
  const dash = solid ? undefined : "6 4"
  return (
    <path
      d={ROUTE}
      stroke={solid ? "var(--illus-accent)" : "var(--muted-foreground)"}
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
    <circle r={4.5} fill="var(--illus-accent)" opacity={0.9}>
      <animateMotion
        dur="2.8s"
        repeatCount="indefinite"
        path={ROUTE}
        calcMode="spline"
        keyTimes="0;1"
        keySplines="0.42 0 0.58 1"
      />
    </circle>
  )
}

// Simplified paddle: shaft line + two blade ellipses.
// Abstracted geometry, immediately recognisable to a kayaker.
function Paddle({ cy = 178, opacity = 0.45 }: { cy?: number; opacity?: number }) {
  return (
    <g opacity={opacity}>
      {/* Shaft */}
      <line
        x1="110"
        y1={cy}
        x2="370"
        y2={cy}
        stroke="var(--illus-accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Left blade */}
      <ellipse
        cx="92"
        cy={cy}
        rx="24"
        ry="10"
        fill="var(--illus-accent)"
        transform={`rotate(-10, 92, ${cy})`}
      />
      {/* Left blade highlight */}
      <ellipse
        cx="92"
        cy={cy}
        rx="16"
        ry="6"
        fill="none"
        stroke="var(--background)"
        strokeWidth="1"
        opacity="0.3"
        transform={`rotate(-10, 92, ${cy})`}
      />
      {/* Right blade */}
      <ellipse
        cx="388"
        cy={cy}
        rx="24"
        ry="10"
        fill="var(--illus-accent)"
        transform={`rotate(10, 388, ${cy})`}
      />
      {/* Right blade highlight */}
      <ellipse
        cx="388"
        cy={cy}
        rx="16"
        ry="6"
        fill="none"
        stroke="var(--background)"
        strokeWidth="1"
        opacity="0.3"
        transform={`rotate(10, 388, ${cy})`}
      />
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
      <path
        d="M 240 192 Q 318 172 410 180"
        stroke="var(--muted-foreground)"
        strokeWidth="1.2"
        strokeDasharray="3 7"
        fill="none"
        opacity="0.18"
      />
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
      <Route opacity={0.3} />
      <TrackingNode />
    </>
  )
}

// Success: route resolved, compass true north, flag planted, sun on the horizon.
function SuccessScene() {
  return (
    <>
      <Compass cx={68} cy={86} r={22} />
      {/* Sun — destination reached, clear day */}
      <circle cx={410} cy={88} r={38} fill="var(--illus-accent)" opacity="0.12" />
      <circle cx={410} cy={88} r={22} fill="var(--illus-accent)" opacity="0.40" />
      <Horizon />
      <Sea />
      <Route solid opacity={0.52} />
      <Waypoint cx={72} cy={192} />
      <Waypoint cx={180} cy={175} />
      <Waypoint cx={300} cy={194} />
      <Waypoint cx={408} cy={180} />
      {/* Flag at destination */}
      <line
        x1="408"
        y1="180"
        x2="408"
        y2="150"
        stroke="var(--illus-accent)"
        strokeWidth="1.5"
        opacity="0.65"
      />
      <path d="M 408 150 L 430 158 L 408 166 Z" fill="var(--illus-accent)" opacity="0.65" />
    </>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export function StateVisual({ state, className }: StateVisualProps) {
  // The two failure states are the app's full-page 404/500 artwork and speak a
  // different visual language on purpose: a single chart rose, not a seascape.
  // A route that trails off into nothing reads as a plan you have yet to
  // finish — exactly what the three seascapes below are for — so reusing that
  // vocabulary for a page that is broken says the wrong thing.
  if (state === "not-found" || state === "error") {
    return <ReinelRose bearing={state === "error" ? "adrift" : "true"} className={className} />
  }

  return (
    <svg
      viewBox="0 0 480 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full", className)}
      aria-hidden="true"
    >
      <rect width="480" height="400" fill="var(--background)" />
      {state === "empty" && <EmptyScene />}
      {state === "loading" && <LoadingScene />}
      {state === "success" && <SuccessScene />}
    </svg>
  )
}
