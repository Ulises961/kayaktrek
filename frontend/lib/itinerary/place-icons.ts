import {
  Droplet,
  Utensils,
  Tent,
  Anchor,
  Toilet,
  TriangleAlert,
  Eye,
  House,
  MapPin,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// Resolve a category's kebab-case `icon` (set by the backend seed) to a Lucide
// component. Keyed by the icon name rather than the slug so a new seeded category
// brings its own glyph without a frontend change; unknown names fall back to a pin.
const ICON_BY_NAME: Record<string, LucideIcon> = {
  droplet: Droplet,
  utensils: Utensils,
  tent: Tent,
  anchor: Anchor,
  toilet: Toilet,
  "triangle-alert": TriangleAlert,
  eye: Eye,
  house: House,
  "map-pin": MapPin,
}

export function placeIcon(iconName: string | null | undefined): LucideIcon {
  return (iconName && ICON_BY_NAME[iconName]) || MapPin
}

// Marker tint. Hazards read in warning red; everything else takes the maritime
// teal so the place layer stays visually distinct from route rings (day colours)
// and tidal diamonds (rate ramp).
export function placeColor(slug: string): string {
  return slug === "hazard" ? "#dc2626" : "#0e7490"
}
