import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ChartHeaderBar } from "../chart-header"

describe("ChartHeaderBar", () => {
  it("renders the wordmark linking to home", () => {
    render(<ChartHeaderBar />)
    const link = screen.getByRole("link", { name: /kayak expedition planner/i })
    expect(link).toHaveAttribute("href", "/")
  })

  it("renders nav content when provided", () => {
    render(<ChartHeaderBar nav={<a href="/login">Log in</a>} />)
    expect(screen.getByRole("navigation")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument()
  })

  it("omits the nav element entirely when no nav is provided", () => {
    render(<ChartHeaderBar />)
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument()
  })
})
