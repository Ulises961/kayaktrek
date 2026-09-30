import { z } from "zod"

import { apiGet } from "../api/client"

// The wind-vectors / wave-vectors endpoints (backend/Resources/sea_resource.py)
// return leaflet-velocity's grid format: two layers, eastward then northward,
// each a flat row-major array starting at the north-west corner. A `null` cell
// is masked (land, for waves) and must spawn no particle.
//
// Parsed here rather than reusing frontend's `VelocityGridData` because that is
// a bare interface (no runtime check), and its `source` union ("station" |
// "manual") describes tidal data, not these endpoints, which send "weather" or
// "marine".
const GridHeaderSchema = z.object({
  la1: z.number(),
  la2: z.number(),
  lo1: z.number(),
  lo2: z.number(),
  nx: z.number().int().positive(),
  ny: z.number().int().positive(),
  dx: z.number(),
  dy: z.number(),
  parameterNumber: z.number(),
})

const GridLayerSchema = z.object({
  header: GridHeaderSchema,
  data: z.array(z.number().nullable()),
})

const VelocityResponseSchema = z.object({
  source: z.string().optional(),
  grid: z.array(GridLayerSchema),
})

// GRIB parameter numbers leaflet-velocity uses for the two components.
const EASTWARD = 2
const NORTHWARD = 3

export type VelocityField = {
  /** North-west corner, degrees. */
  north: number
  west: number
  south: number
  east: number
  nx: number
  ny: number
  /** Eastward (u) and northward (v) components in m/s, row-major from the NW corner; null = masked. */
  u: (number | null)[]
  v: (number | null)[]
}

async function fetchVectors(dayId: string, hour: number, endpoint: string): Promise<VelocityField | null> {
  const raw = await apiGet<unknown>(`/api/day/${dayId}/${endpoint}?hour=${hour}`)
  const { grid } = VelocityResponseSchema.parse(raw)

  // The backend sends an empty grid when the day has no forecast for this field —
  // nothing to draw, which is not a failure.
  if (grid.length === 0) return null

  const eastLayer = grid.find((layer) => layer.header.parameterNumber === EASTWARD)
  const northLayer = grid.find((layer) => layer.header.parameterNumber === NORTHWARD)
  if (!eastLayer || !northLayer) {
    throw new Error(`${endpoint} grid is missing its eastward or northward component`)
  }

  const { la1, la2, lo1, lo2, nx, ny } = eastLayer.header
  const cells = nx * ny
  if (eastLayer.data.length !== cells || northLayer.data.length !== cells) {
    throw new Error(`${endpoint} grid has ${eastLayer.data.length}/${northLayer.data.length} cells, expected ${cells}`)
  }

  return { north: la1, south: la2, west: lo1, east: lo2, nx, ny, u: eastLayer.data, v: northLayer.data }
}

// GET /api/v1/day/<id>/wind-vectors?hour=<0-23> — km/h forecast converted to m/s.
export function fetchWindVectors(dayId: string, hour: number): Promise<VelocityField | null> {
  return fetchVectors(dayId, hour, "wind-vectors")
}

// GET /api/v1/day/<id>/wave-vectors?hour=<0-23> — wave height stands in for speed,
// land cells masked.
export function fetchWaveVectors(dayId: string, hour: number): Promise<VelocityField | null> {
  return fetchVectors(dayId, hour, "wave-vectors")
}
