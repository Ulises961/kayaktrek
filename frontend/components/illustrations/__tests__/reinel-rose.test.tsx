import { render } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { ReinelRose } from "@/components/illustrations/reinel-rose"
import { StateVisual } from "@/components/illustrations/state-visual"

function roseOf(container: HTMLElement) {
  return container.querySelector("svg")
}

// The animation lives on a group inside the SVG, not on the SVG itself.
function movingPartOf(container: HTMLElement) {
  return container.querySelector("svg > g")
}

describe("ReinelRose", () => {
  it("draws every octant of the rose, not just the one that was authored", () => {
    // The rose is one eighth rotated eight times; a regression that drops the
    // rotation map still renders "a compass", so count the octants explicitly.
    const { container } = render(<ReinelRose />)
    const octants = container.querySelectorAll('g[transform^="rotate("]')

    expect(octants).toHaveLength(8)
    expect(Array.from(octants).map((group) => group.getAttribute("transform"))).toEqual([
      "rotate(0)",
      "rotate(45)",
      "rotate(90)",
      "rotate(135)",
      "rotate(180)",
      "rotate(225)",
      "rotate(270)",
      "rotate(315)",
    ])
  })

  it("colours every mark from a --rose-* variable so both themes are tunable in CSS", () => {
    // A single hardcoded fill is invisible in one theme and wrong in the other.
    const { container } = render(<ReinelRose />)
    const painted = Array.from(container.querySelectorAll("path, circle")).flatMap((mark) =>
      [mark.getAttribute("fill"), mark.getAttribute("stroke")].filter(
        (value): value is string => value !== null && value !== "none",
      ),
    )

    expect(painted.length).toBeGreaterThan(0)
    expect(painted.every((value) => value.startsWith("var(--rose-"))).toBe(true)
  })

  it("settles onto north by default and hunts for it when adrift", () => {
    const { container: settled } = render(<ReinelRose />)
    const { container: adrift } = render(<ReinelRose bearing="adrift" />)

    expect(movingPartOf(settled)).toHaveClass("rose-settle")
    expect(movingPartOf(settled)).not.toHaveClass("rose-hunt")
    expect(roseOf(settled)).not.toHaveClass("rose-adrift")

    expect(movingPartOf(adrift)).toHaveClass("rose-hunt")
    expect(movingPartOf(adrift)).not.toHaveClass("rose-settle")
    // The colour drain is a variable override, so it has to sit on the root the
    // whole drawing inherits from — not on the group that happens to rotate.
    expect(roseOf(adrift)).toHaveClass("rose-adrift")
  })

  it("spins about the hub, not about the middle of its own box", () => {
    // The box is deeper above the hub than below it (only north carries a
    // fleur-de-lys), so the box centre is NOT the hub: a rotation origin that
    // drifts from the viewBox sends the rose orbiting a point above itself.
    const { container } = render(<ReinelRose />)
    const [minX, minY] = roseOf(container)!.getAttribute("viewBox")!.split(" ").map(Number)
    const origin = movingPartOf(container)!.getAttribute("style")!

    // transform-box: view-box measures from the viewBox's top-left corner, so
    // the hub — user-space (0,0) — is at (-minX, -minY) in that frame.
    expect(origin).toContain("transform-box: view-box")
    expect(origin).toContain(`transform-origin: ${-minX}px ${-minY}px`)
  })

  it("is decorative — the copy beside it carries the message", () => {
    const { container } = render(<ReinelRose />)

    expect(roseOf(container)).toHaveAttribute("aria-hidden", "true")
  })
})

describe("StateVisual", () => {
  it("hands the two error states to the rose and keeps the seascape for the rest", () => {
    const { container: notFound } = render(<StateVisual state="not-found" />)
    const { container: error } = render(<StateVisual state="error" />)
    const { container: empty } = render(<StateVisual state="empty" />)

    expect(movingPartOf(notFound)).toHaveClass("rose-settle")
    expect(roseOf(error)).toHaveClass("rose-adrift")
    expect(movingPartOf(empty)).not.toHaveClass("rose-settle")
    expect(roseOf(empty)).not.toHaveClass("rose-adrift")
  })

  it("passes className through to whichever visual it picked", () => {
    const { container } = render(<StateVisual state="not-found" className="max-w-[14rem]" />)

    expect(roseOf(container)).toHaveClass("max-w-[14rem]")
  })
})
