import { describe, it, expect } from "vitest"
import { findHead, findTail, walkList } from "../linked-list"
import type { Point } from "@/lib/dtos/point"

const P1 = "01952f1a-0000-7000-8000-000000000001"
const P2 = "01952f1a-0000-7000-8000-000000000002"
const P3 = "01952f1a-0000-7000-8000-000000000003"

// Flat array using nextId (the FK field in the API response — `next` relationship is lazy)
const p1: Point = { id: P1, type: "position", nextId: P2 }
const p2: Point = { id: P2, type: "position", nextId: P3 }
const p3: Point = { id: P3, type: "position" }

const POINTS: Point[] = [p3, p1, p2] // deliberately unordered

describe("findHead", () => {
  it("returns the point not referenced as next by anyone", () => {
    expect(findHead(POINTS)?.id).toBe(P1)
  })

  it("returns null for an empty list", () => {
    expect(findHead([])).toBeNull()
  })

  it("returns the only point in a single-element list", () => {
    const single: Point[] = [{ id: P1, type: "position" }]
    expect(findHead(single)?.id).toBe(P1)
  })

  it("returns a point when next references are undefined", () => {
    const pts: Point[] = [
      { id: P1, type: "stop" },
      { id: P2, type: "stop" },
    ]
    // Both have no next — findHead picks the one that isn't a next of anyone
    // (both qualify, so it returns the first match)
    expect(findHead(pts)).not.toBeNull()
  })
})

describe("findTail", () => {
  it("returns the point with no next reference", () => {
    expect(findTail(POINTS)?.id).toBe(P3)
  })

  it("returns null for an empty list", () => {
    expect(findTail([])).toBeNull()
  })

  it("returns the only point in a single-element list", () => {
    const single: Point[] = [{ id: P1, type: "position" }]
    expect(findTail(single)?.id).toBe(P1)
  })
})

describe("walkList", () => {
  it("returns points in linked-list order regardless of input order", () => {
    const result = walkList(POINTS)
    expect(result.map((p) => p.id)).toEqual([P1, P2, P3])
  })

  it("returns an empty array for empty input", () => {
    expect(walkList([])).toEqual([])
  })

  it("returns the single point for a one-element list", () => {
    const single: Point[] = [{ id: P1, type: "position" }]
    expect(walkList(single).map((p) => p.id)).toEqual([P1])
  })

  it("does not infinite-loop on a cyclic next chain", () => {
    const cyclic: Point[] = [
      { id: P1, type: "position", nextId: P2 },
      { id: P2, type: "position", nextId: P1 },
    ]
    const result = walkList(cyclic)
    expect(result.length).toBeLessThanOrEqual(2)
  })

  it("includes all points even when head detection yields a fallback", () => {
    // Points with no clear head (no id)
    const pts: Point[] = [
      { type: "position" },
      { type: "stop" },
    ]
    expect(walkList(pts).length).toBe(2)
  })
})
