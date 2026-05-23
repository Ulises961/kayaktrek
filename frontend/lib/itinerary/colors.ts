export const DAY_COLORS = [
  "#2272b6", // ocean500 — slate-blue
  "#2aa8a0", // foam400 — teal
  "#f59e0b", // sunset400 — amber
  "#f97316", // coral/orange
  "#8b5cf6", // violet
  "#ec4899", // pink
] as const

export const UNASSIGNED_COLOR = "#94a3b8" // slate400 — grey

export function getDayColor(dayNumber: number): string {
  if (dayNumber === 0) return UNASSIGNED_COLOR
  return DAY_COLORS[(dayNumber - 1) % DAY_COLORS.length]
}
