import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DatePicker } from "../date-picker"

describe("DatePicker — minDate", () => {
  it("disables calendar days before minDate", async () => {
    render(<DatePicker value="2026-06-20" onChange={vi.fn()} minDate="2026-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    expect(screen.getByText("10").closest("button")).toBeDisabled()
  })

  it("does not call onChange when a disabled date is clicked", async () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-06-20" onChange={onChange} minDate="2026-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    await userEvent.click(screen.getByText("10"))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("still allows selecting a date on or after minDate", async () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-06-20" onChange={onChange} minDate="2026-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    await userEvent.click(screen.getByText("18"))
    expect(onChange).toHaveBeenCalledWith("2026-06-18")
  })

  it("does not disable any dates when minDate is not provided", async () => {
    render(<DatePicker value="2026-06-20" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    expect(screen.getByText("10").closest("button")).not.toBeDisabled()
  })
})
