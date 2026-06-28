import { palette } from "@/lib/tokens"

// Shared "nautical chart" chrome palette — named aliases over the maritime tokens
// so the engraved graticule / scale / ink language reads at a glance. Used by the
// chart map furniture (graticule, scale bar, forecast cell) and the landing route
// lines; kept here so the planner can adopt the same furniture later (M5 overlay).
export const CHART_INK = palette.ocean700 // graticule, scale bar, marginalia
export const CHART_DEEP = palette.ocean900 // route line core
export const CHART_PAPER = palette.chartPaper // route halo + alternating scale-bar cells
// chartPaper (#f7f4ec) at 0.9 alpha — legibility glow behind chart marginalia.
export const CHART_PAPER_GLOW = "rgba(247,244,236,0.9)"
