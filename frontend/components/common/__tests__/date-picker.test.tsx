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

describe("DatePicker — maxDate", () => {
  it("disables calendar days after maxDate", async () => {
    render(<DatePicker value="2026-06-20" onChange={vi.fn()} maxDate="2026-06-25" />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    expect(screen.getByText("28").closest("button")).toBeDisabled()
  })

  it("does not call onChange when a date past maxDate is clicked", async () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-06-20" onChange={onChange} maxDate="2026-06-25" />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    await userEvent.click(screen.getByText("28"))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("still allows selecting a date on or before maxDate", async () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-06-20" onChange={onChange} maxDate="2026-06-25" />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    await userEvent.click(screen.getByText("22"))
    expect(onChange).toHaveBeenCalledWith("2026-06-22")
  })

  it("combines with minDate to bound both ends", async () => {
    render(
      <DatePicker
        value="2026-06-20"
        onChange={vi.fn()}
        minDate="2026-06-15"
        maxDate="2026-06-25"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    expect(screen.getByText("10").closest("button")).toBeDisabled()
    expect(screen.getByText("28").closest("button")).toBeDisabled()
  })
})

describe("DatePicker — defaultMonth anchoring", () => {
  // Far-future dates so they can never coincide with the real "today" the
  // test runs on — no system-time mocking needed (Radix's Popover doesn't
  // play well with fake timers; no precedent for that pattern in this repo).

  it("opens on minDate's month when no value is set yet, not today's month", async () => {
    render(<DatePicker onChange={vi.fn()} minDate="2031-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /pick a date/i }))
    expect(screen.getByText(/june 2031/i)).toBeInTheDocument()
  })

  it("opens on maxDate's month when no value or minDate is set", async () => {
    render(<DatePicker onChange={vi.fn()} maxDate="2031-09-10" />)
    await userEvent.click(screen.getByRole("button", { name: /pick a date/i }))
    expect(screen.getByText(/september 2031/i)).toBeInTheDocument()
  })

  it("opens on the selected value's month when a value is set, ignoring minDate", async () => {
    render(<DatePicker value="2031-03-05" onChange={vi.fn()} minDate="2031-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /5 mar 2031/i }))
    expect(screen.getByText(/march 2031/i)).toBeInTheDocument()
  })
})

describe("DatePicker — suggested date", () => {
  // modifiersClassNames is applied by react-day-picker to the day's <td>
  // cell (not the <button> inside it) — see react-day-picker's Day
  // component. aria-label ("Tuesday, July 1st, 2031"-style) disambiguates
  // outside-days duplicating a visible day number across month boundaries.

  it("highlights the day right after minDate as the suggested choice", async () => {
    render(<DatePicker onChange={vi.fn()} minDate="2031-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /pick a date/i }))
    const day16 = screen.getByRole("button", { name: /june 16th, 2031/i })
    expect(day16.closest("td")).toHaveClass("ring-primary/50")
  })

  it("does not mark minDate itself, or other days, as suggested", async () => {
    render(<DatePicker onChange={vi.fn()} minDate="2031-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /pick a date/i }))
    const day15 = screen.getByRole("button", { name: /june 15th, 2031/i })
    const day17 = screen.getByRole("button", { name: /june 17th, 2031/i })
    expect(day15.closest("td")).not.toHaveClass("ring-primary/50")
    expect(day17.closest("td")).not.toHaveClass("ring-primary/50")
  })

  it("still allows picking a date later than the suggested one", async () => {
    const onChange = vi.fn()
    render(<DatePicker onChange={onChange} minDate="2031-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /pick a date/i }))
    await userEvent.click(screen.getByRole("button", { name: /june 20th, 2031/i }))
    expect(onChange).toHaveBeenCalledWith("2031-06-20")
  })

  it("rolls the suggestion (and the calendar's default month) into the next month when minDate is the last day of a month", async () => {
    render(<DatePicker onChange={vi.fn()} minDate="2031-06-30" />)
    await userEvent.click(screen.getByRole("button", { name: /pick a date/i }))
    expect(screen.getByText(/july 2031/i)).toBeInTheDocument()
    const july1 = screen.getByRole("button", { name: /july 1st, 2031/i })
    expect(july1.closest("td")).toHaveClass("ring-primary/50")
  })

  it("does not suggest a date beyond maxDate", async () => {
    render(<DatePicker onChange={vi.fn()} minDate="2031-06-15" maxDate="2031-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /pick a date/i }))
    const day16 = screen.getByRole("button", { name: /june 16th, 2031/i })
    expect(day16.closest("td")).not.toHaveClass("ring-primary/50")
  })

  it("does not suggest anything when a value is already set", async () => {
    render(<DatePicker value="2031-06-20" onChange={vi.fn()} minDate="2031-06-15" />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2031/i }))
    const day16 = screen.getByRole("button", { name: /june 16th, 2031/i })
    expect(day16.closest("td")).not.toHaveClass("ring-primary/50")
  })
})

describe("DatePicker — footer", () => {
  it("renders footer content inside the popover when provided", async () => {
    render(<DatePicker value="2026-06-20" onChange={vi.fn()} footer={<p>Need a later date?</p>} />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    expect(screen.getByText("Need a later date?")).toBeInTheDocument()
  })

  it("renders no footer when not provided", async () => {
    render(<DatePicker value="2026-06-20" onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: /20 jun 2026/i }))
    expect(screen.queryByText("Need a later date?")).not.toBeInTheDocument()
  })
})
