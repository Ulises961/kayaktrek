import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ChartHeaderBar } from "../chart-header"

describe("ChartHeaderBar", () => {
  it("renders the wordmark linking to home", () => {
    render(<ChartHeaderBar />)
    const link = screen.getByRole("link", { name: /kayaktrek/i })
    expect(link).toHaveAttribute("href", "/")
  })

  it("renders nav content alongside the toggle when provided", () => {
    render(<ChartHeaderBar nav={<a href="/login">Log in</a>} />)
    expect(screen.getByRole("navigation")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Log in" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument()
  })

  it("carries the theme toggle even with no nav", () => {
    // Every anonymous-facing page renders through this strip and none of them
    // has another home for the control — without it here, a visitor who landed
    // in dark mode has to sign in to get back out of it.
    render(<ChartHeaderBar />)
    expect(screen.getByRole("button", { name: /toggle theme/i })).toBeInTheDocument()
  })

  it("defaults the brand subtitle on, so every caller gets it without asking", () => {
    render(<ChartHeaderBar />)
    expect(screen.getByText(/sea-kayak expedition planner/i)).toBeInTheDocument()
  })

  it("lets a caller suppress the subtitle", () => {
    render(<ChartHeaderBar brandSubtitle="" />)
    expect(screen.queryByText(/expedition planner/i)).not.toBeInTheDocument()
  })
})
