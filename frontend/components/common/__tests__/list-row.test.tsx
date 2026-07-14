import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { ListRow, listRowClass } from "../list-row"

describe("listRowClass", () => {
  it("builds the hairline row recipe", () => {
    const cls = listRowClass()
    expect(cls).toContain("border-b")
    expect(cls).toContain("border-border/50")
    expect(cls).toContain("last:border-b-0")
  })

  it("adds the zebra variant on request, off by default", () => {
    expect(listRowClass({ zebra: true })).toContain("odd:bg-surface-2/50")
    expect(listRowClass()).not.toContain("odd:bg-surface-2/50")
  })
})

describe("ListRow", () => {
  it("renders an <li> by default with the row recipe", () => {
    const { container } = render(
      <ul>
        <ListRow>Crew member</ListRow>
      </ul>,
    )
    const row = container.querySelector("li")!
    expect(row.textContent).toBe("Crew member")
    expect(row.className).toContain("border-b")
  })

  it("renders polymorphically via the as prop", () => {
    const { container } = render(<ListRow as="div">Day 1</ListRow>)
    expect(container.querySelector("div")!.textContent).toBe("Day 1")
  })

  it("merges custom classes and passes through props", () => {
    const { container } = render(
      <ListRow as="div" data-testid="row" className="py-2.5">
        x
      </ListRow>,
    )
    const row = container.querySelector("[data-testid=row]")!
    expect(row.className).toContain("py-2.5")
    expect(row.className).toContain("border-b")
  })
})
