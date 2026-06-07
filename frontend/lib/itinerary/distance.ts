const EARTH_RADIUS_NM = 3440.065

export function haversineNm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h))
}

export function totalDistanceNm(
  points: { latitude: number; longitude: number }[]
): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineNm(points[i], points[i + 1])
  }
  return total
}

export function segmentMidpoint(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): { latitude: number; longitude: number } {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  }
}

export function toKm(nm: number): number {
  return nm * 1.852
}

export function formatDistance(nm: number, unit: "nm" | "km"): string {
  const value = unit === "nm" ? nm : toKm(nm)
  return value.toFixed(1)
}

export function estimatedTime(
  distanceNm: number,
  speedKnots: number
): { hours: number; minutes: number } {
  const totalHours = distanceNm / speedKnots
  const hours = Math.floor(totalHours)
  const minutes = Math.round((totalHours - hours) * 60)
  return { hours, minutes }
}

export function formatTime({
  hours,
  minutes,
}: {
  hours: number
  minutes: number
}): string {
  if (hours === 0) return `${minutes}min`
  return `${hours}h ${minutes}min`
}

export function legLabel(
  distanceNm: number,
  speedKnots: number,
  unit: "nm" | "km"
): string {
  const dist = formatDistance(distanceNm, unit)
  const time = formatTime(estimatedTime(distanceNm, speedKnots))
  return `${dist} ${unit} · ${time}`
}
