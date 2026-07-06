import type { Point } from "@/lib/dtos/point"

export type Linkable = {
  id?: string | null
  nextId?: string | null
}

function resolveNextId(p: Linkable & { next?: { id?: string | null } | null }): string | undefined {
  return p.nextId ?? p.next?.id ?? undefined
}

export function findHead<T extends Linkable>(points: T[]): T | null {
  if (points.length === 0) return null
  const nextIds = new Set(
    points.flatMap((p) => {
      const n = p.nextId
      return n ? [n] : []
    }),
  )
  return points.find((p) => p.id != null && !nextIds.has(p.id)) ?? null
}

export function findTail<T extends Linkable>(points: T[]): T | null {
  if (points.length === 0) return null
  return points.find((p) => !p.nextId) ?? null
}

export function walkList<T extends Linkable & { next?: { id?: string | null } | null }>(
  points: T[],
): T[] {
  if (points.length === 0) return []
  const nextIds = new Set(
    points.flatMap((p) => {
      const n = resolveNextId(p)
      return n ? [n] : []
    }),
  )
  const allHeads = points.filter((p) => p.id != null && !nextIds.has(p.id!))
  if (allHeads.length === 0) return [...points]
  allHeads.sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
  const byId = new Map(points.filter((p) => p.id).map((p) => [p.id!, p]))
  const ordered: T[] = []
  const visited = new Set<string>()
  for (const head of allHeads) {
    let current: T | null | undefined = head
    while (current) {
      const id = current.id
      if (id) {
        if (visited.has(id)) break
        visited.add(id)
      }
      ordered.push(current)
      const nextId = resolveNextId(current)
      current = nextId ? (byId.get(nextId) ?? null) : null
    }
  }
  return ordered
}

// Convenience wrapper for the full Point type (preserves the next?.id fallback).
export function walkPoints(points: Point[]): Point[] {
  return walkList(points)
}

// Each point's 1-based ordinal position across the *whole* ordered list passed
// in — e.g. point 3 of 14. Callers that group points into day segments (map
// chrome, public route rendering) must number the full cross-day list first and
// look up by id afterward, rather than numbering within a single day/segment —
// otherwise the count silently resets at every day boundary. Shared by the
// authenticated builder (map-core.tsx) and the public route renderers
// (public-routes.ts) so both stay consistent.
export function numberByOrder<T extends Linkable>(points: T[]): Map<string, number> {
  const m = new Map<string, number>()
  points.forEach((p, i) => {
    if (p.id) m.set(p.id, i + 1)
  })
  return m
}
