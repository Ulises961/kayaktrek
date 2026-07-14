import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { CardTopRule } from "../card-top-rule"

describe("CardTopRule", () => {
  it("renders the gradient chart rule, hidden from assistive tech", () => {
    const { container } = render(<CardTopRule />)
    const rule = container.firstElementChild!
    expect(rule.classList.contains("chart-top-rule")).toBe(true)
    expect(rule.getAttribute("aria-hidden")).toBe("true")
    expect(rule.getAttribute("style")).toBeNull()
  })

  it("overrides the gradient with a flat palette color when given one", () => {
    const { container } = render(<CardTopRule color="#2272b6" />)
    const rule = container.firstElementChild as HTMLElement
    expect(rule.style.background).toContain("rgb(34, 114, 182)")
  })

  it("merges positioning classes", () => {
    const { container } = render(<CardTopRule className="absolute inset-x-0 top-0" />)
    expect(container.firstElementChild!.className).toContain("absolute")
  })
})
