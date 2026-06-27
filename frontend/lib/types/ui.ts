export type Size = "sm" | "md" | "lg"

export type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive"

export interface Crumb {
  label: string
  href?: string
}

export interface HomeIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface VelocityGridHeader {
  parameterUnit: string
  parameterCategory: number
  parameterNumber: number
  parameterNumberName: string
  la1: number
  la2: number
  lo1: number
  lo2: number
  nx: number
  ny: number
  dx: number
  dy: number
  [key: string]: unknown
}

export interface VelocityGridLayer {
  header: VelocityGridHeader
  // `null` marks a masked cell — leaflet-velocity treats it as out-of-field and
  // spawns no particle there. Used to clip a field to a disc (the forecast cell).
  data: (number | null)[]
}

// Shape returned by the wind-vectors and wave-vectors endpoints.
// `grid` is passed directly to leaflet-velocity; `source` labels the data origin.
// (Tidal streams render as discrete diamonds, not a velocity field — see TidalDiamond.)
export interface VelocityGridData {
  source?: "station" | "manual"
  grid: VelocityGridLayer[]
}

export interface VelocityLayerProps {
  data: VelocityGridLayer[]
  options?: Record<string, unknown>
}
