export function formatVesselLength(cm: number | null | undefined): string | null {
  if (cm == null) return null
  return `${(cm / 100).toFixed(2)} m`
}
