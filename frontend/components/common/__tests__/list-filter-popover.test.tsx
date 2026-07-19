import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ListFilterPopover } from "../list-filter-popover"

describe("ListFilterPopover", () => {
  it("renders the Filters trigger without a badge when nothing is active", () => {
    render(
      <ListFilterPopover activeCount={0} onClear={vi.fn()}>
        <p>field</p>
      </ListFilterPopover>,
    )
    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument()
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })

  it("shows the active-filter count badge", () => {
    render(
      <ListFilterPopover activeCount={2} onClear={vi.fn()}>
        <p>field</p>
      </ListFilterPopover>,
    )
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("reveals its children once opened", async () => {
    const user = userEvent.setup()
    render(
      <ListFilterPopover activeCount={0} onClear={vi.fn()}>
        <p>Sea state filter</p>
      </ListFilterPopover>,
    )
    expect(screen.queryByText("Sea state filter")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /filters/i }))
    expect(screen.getByText("Sea state filter")).toBeInTheDocument()
  })

  it("only offers Clear filters when a filter is active, and calls onClear", async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()
    const { rerender } = render(
      <ListFilterPopover activeCount={0} onClear={onClear}>
        <p>field</p>
      </ListFilterPopover>,
    )
    await user.click(screen.getByRole("button", { name: /filters/i }))
    expect(screen.queryByRole("button", { name: /clear filters/i })).not.toBeInTheDocument()

    rerender(
      <ListFilterPopover activeCount={1} onClear={onClear}>
        <p>field</p>
      </ListFilterPopover>,
    )
    await user.click(screen.getByRole("button", { name: /clear filters/i }))
    expect(onClear).toHaveBeenCalledOnce()
  })
})
