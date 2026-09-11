import {
  Droplet,
  Utensils,
  Store,
  Kayak,
  Fuel,
  Beer,
  Tent,
  House,
  Bed,
  Anchor,
  SquareParking,
  Sailboat,
  Bus,
  TrainFront,
  Ship,
  TriangleAlert,
  LifeBuoy,
  Cross,
  Signal,
  Eye,
  Umbrella,
  Bird,
  Toilet,
  MapPin,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// Resolve a category's kebab-case `icon` (set by the backend seed) to a Lucide
// component. Keyed by the icon name rather than the slug so a new seeded category
// brings its own glyph without a frontend change; unknown names fall back to a pin.
const ICON_BY_NAME: Record<string, LucideIcon> = {
  droplet: Droplet,
  utensils: Utensils,
  store: Store,
  kayak: Kayak,
  fuel: Fuel,
  beer: Beer,
  tent: Tent,
  house: House,
  bed: Bed,
  anchor: Anchor,
  "square-parking": SquareParking,
  sailboat: Sailboat,
  bus: Bus,
  "train-front": TrainFront,
  ship: Ship,
  "triangle-alert": TriangleAlert,
  "life-buoy": LifeBuoy,
  cross: Cross,
  signal: Signal,
  eye: Eye,
  umbrella: Umbrella,
  bird: Bird,
  toilet: Toilet,
  "map-pin": MapPin,
}

export function placeIcon(iconName: string | null | undefined): LucideIcon {
  return (iconName && ICON_BY_NAME[iconName]) || MapPin
}

// Slugs that read as dangers — painted red rather than teal. A set (not a single
// equality) so any hazard subtype added later tints correctly without touching
// placeColor.
const HAZARD_SLUGS = new Set(["hazard"])

// Marker tint. Hazards read in warning red; everything else takes the maritime
// teal so the place layer stays visually distinct from route rings (day colours)
// and tidal diamonds (rate ramp).
export function placeColor(slug: string): string {
  return HAZARD_SLUGS.has(slug) ? "#dc2626" : "#0e7490"
}
