import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { BrandMark } from "../brand-mark"

function markOf(container: HTMLElement) {
  return container.querySelector("svg")
}

describe("BrandMark", () => {
  it("draws all eight points of the rose", () => {
    // Four principal points and four intercardinals, each split into a shaded
    // and a sunlit half, plus the north half painted over its neighbours. A
    // regression that drops a subset still renders "a star", so count them.
    const { container } = render(<BrandMark />)
    expect(container.querySelectorAll("path")).toHaveLength(24)
  })

  it("paints every mark from a --mark-* variable so both themes are tunable in CSS", () => {
    // The mark it replaced hardcoded ocean900, which is also the dark-mode
    // background — the whole mark vanished in the dark app-shell header.
    const { container } = render(<BrandMark />)
    const fills = Array.from(container.querySelectorAll("path")).map((path) =>
      path.getAttribute("fill"),
    )

    expect(fills).toHaveLength(24)
    expect(fills.every((fill) => fill?.startsWith("var(--mark-"))).toBe(true)
  })

  it("warms both ends of the north–south axis, and only those", () => {
    // The hull is the warm note: north's sunlit half and south's, so the axis
    // closes into a shape with a point at each end. One of them alone is a
    // slice of a single point; a third anywhere and the mark is a warm star
    // with no axis to read.
    const { container } = render(<BrandMark />)
    const hull = Array.from(container.querySelectorAll("path")).filter(
      (path) => path.getAttribute("fill") === "var(--mark-hull)",
    )

    expect(hull).toHaveLength(2)
  })

  it("keeps the tone census the symmetric axis implies", () => {
    // South's shaded half used to be --mark-ink, the darkest tone in the mark,
    // which left the bow lit and the stern in shadow. Moving it to --mark-lit
    // (matching north's) and its sunlit half to --mark-hull is what makes the
    // axis one continuous shape. Retint the wrong path and the census shifts,
    // which is the regression this catches — the eight-point count above
    // cannot, since a miscoloured path is still a path.
    const { container } = render(<BrandMark />)
    const census = Array.from(container.querySelectorAll("path")).reduce<Record<string, number>>(
      (counts, path) => {
        const fill = path.getAttribute("fill")!
        counts[fill] = (counts[fill] ?? 0) + 1
        return counts
      },
      {},
    )

    expect(census).toEqual({
      "var(--mark-ink)": 10,
      "var(--mark-lit)": 12,
      "var(--mark-hull)": 2,
    })
  })

  it("is square, so it can be dropped into a favicon slot without cropping", () => {
    const { container } = render(<BrandMark />)
    const [, , width, height] = markOf(container)!.getAttribute("viewBox")!.split(" ").map(Number)

    expect(width).toBe(height)
  })

  it("sizes from the one prop, both axes", () => {
    const { container } = render(<BrandMark size={22} />)

    expect(markOf(container)).toHaveAttribute("width", "22")
    expect(markOf(container)).toHaveAttribute("height", "22")
  })

  it("is decorative — the wordmark beside it names the link", () => {
    const { container } = render(<BrandMark />)

    expect(markOf(container)).toHaveAttribute("aria-hidden", "true")
  })
})
