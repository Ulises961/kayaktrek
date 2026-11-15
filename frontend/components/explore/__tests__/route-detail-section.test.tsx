import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RouteDetailSection } from "../route-detail-section"

describe("RouteDetailSection", () => {
  it("shows its content and says so when it starts open", () => {
    render(
      <RouteDetailSection title="About this route" defaultOpen>
        <p>The pitch</p>
      </RouteDetailSection>,
    )
    expect(screen.getByText("The pitch")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "About this route" })).toHaveAttribute(
      "aria-expanded",
      "true",
    )
  })

  it("keeps its content out of the page when it starts closed", () => {
    render(
      <RouteDetailSection title="Daily breakdown" defaultOpen={false}>
        <p>Day 1</p>
      </RouteDetailSection>,
    )
    expect(screen.queryByText("Day 1")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Daily breakdown" })).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })

  it("opens and closes from its heading", async () => {
    render(
      <RouteDetailSection title="Daily breakdown" defaultOpen={false}>
        <p>Day 1</p>
      </RouteDetailSection>,
    )
    const heading = screen.getByRole("button", { name: "Daily breakdown" })

    await userEvent.click(heading)
    expect(screen.getByText("Day 1")).toBeInTheDocument()

    await userEvent.click(heading)
    expect(screen.queryByText("Day 1")).not.toBeInTheDocument()
  })
})
