import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PageHeading } from "../page-heading"

describe("PageHeading", () => {
  it("renders children inside an h1", () => {
    render(<PageHeading>Trips</PageHeading>)
    expect(screen.getByRole("heading", { level: 1, name: "Trips" })).toBeInTheDocument()
  })

  it("applies the responsive size/weight classes", () => {
    render(<PageHeading>Trips</PageHeading>)
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading).toHaveClass("text-xl", "font-semibold", "sm:text-2xl")
  })

  it("merges an additional className", () => {
    render(<PageHeading className="truncate">Trips</PageHeading>)
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("truncate")
  })
})
