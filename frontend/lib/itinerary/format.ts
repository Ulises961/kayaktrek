// The one canonical place-to-place range label. Falls back to just the start name
// when there's no distinct end name to show.
export function formatRouteRange(
  startName: string | null | undefined,
  endName: string | null | undefined,
): string {
  if (startName && endName && endName !== startName) return `${startName} to ${endName}`
  return startName ?? ""
}
