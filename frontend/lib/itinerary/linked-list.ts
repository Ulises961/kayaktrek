import type { Point } from "@/lib/dtos/point"

function resolveNextId(p: Point): string | undefined {
  return p.nextId ?? p.next?.id ?? undefined
}

export function findHead(points: Point[]): Point | null {
  if (points.length === 0) return null
  const nextIds = new Set(points.flatMap((p) => { const n = resolveNextId(p); return n ? [n] : [] }))
  return points.find((p) => p.id != null && !nextIds.has(p.id)) ?? null
}

export function findTail(points: Point[]): Point | null {
  if (points.length === 0) return null
  return points.find((p) => !resolveNextId(p)) ?? null
}

export function walkList(points: Point[]): Point[] {
  if (points.length === 0) return []
  const head = findHead(points)
  if (!head) return [...points]
  const byId = new Map(points.filter((p) => p.id).map((p) => [p.id!, p]))
  const ordered: Point[] = []
  const visited = new Set<string>()
  let current: Point | null | undefined = head
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
  return ordered
}
