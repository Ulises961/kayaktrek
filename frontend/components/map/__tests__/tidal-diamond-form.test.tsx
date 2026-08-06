import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TidalDiamondForm } from "../tidal-diamond-form"

type SubmittedEntry = { hoursFromHw: number; springRateKnots: number | null }

describe("TidalDiamondForm", () => {
  it("shows simple-mode peak inputs by default", () => {
    render(<TidalDiamondForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/peak spring rate/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/flood direction/i)).toBeInTheDocument()
  })

  it("blocks submission and surfaces errors for an empty simple entry", async () => {
    const onSubmit = vi.fn()
    render(<TidalDiamondForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits parsed numeric values for a valid simple entry", async () => {
    const onSubmit = vi.fn()
    render(<TidalDiamondForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/name/i), "The Race")
    await userEvent.type(screen.getByLabelText(/peak spring rate/i), "3")
    await userEvent.type(screen.getByLabelText(/flood direction/i), "45")
    await userEvent.type(screen.getByLabelText(/ebb direction/i), "225")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "The Race",
      entryMode: "simple",
      maxSpringRateKnots: 3,
      floodDirectionDegrees: 45,
      ebbDirectionDegrees: 225,
    })
  })

  it("switches to the advanced per-hour table", async () => {
    render(<TidalDiamondForm onSubmit={vi.fn()} />)
    await userEvent.click(screen.getByRole("tab", { name: /advanced/i }))
    // One row per hour from -6 to +6.
    expect(screen.getAllByTestId("diamond-hour-row")).toHaveLength(13)
  })

  it("submits the per-hour table for a valid advanced entry", async () => {
    const onSubmit = vi.fn()
    render(<TidalDiamondForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/name/i), "Atlas Point")
    await userEvent.click(screen.getByRole("tab", { name: /advanced/i }))

    // Fill the first row's spring rate; the hidden hoursFromHw input should ride
    // along so the entry round-trips with its hour intact.
    const firstRow = screen.getAllByTestId("diamond-hour-row")[0]
    await userEvent.type(within(firstRow).getAllByRole("spinbutton")[0], "2.5")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const submitted = onSubmit.mock.calls[0][0]
    expect(submitted.entryMode).toBe("atlas")
    expect(
      (submitted.tidalStreamEntries as SubmittedEntry[]).some(
        (e) => e.hoursFromHw === -6 && e.springRateKnots === 2.5,
      ),
    ).toBe(true)
  })

  it("blocks an advanced entry with no rates and surfaces the table error", async () => {
    const onSubmit = vi.fn()
    render(<TidalDiamondForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/name/i), "Atlas Point")
    await userEvent.click(screen.getByRole("tab", { name: /advanced/i }))
    await userEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(screen.getByText(/at least one hourly rate/i)).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("calls onCancel from the cancel button", async () => {
    const onCancel = vi.fn()
    render(<TidalDiamondForm onSubmit={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it("surfaces a server-side error message when the save fails", () => {
    render(<TidalDiamondForm onSubmit={vi.fn()} error="Could not save diamond" />)
    expect(screen.getByText("Could not save diamond")).toBeInTheDocument()
  })

  it("shows no error text when error is null", () => {
    render(<TidalDiamondForm onSubmit={vi.fn()} error={null} />)
    expect(screen.queryByText(/could not save/i)).not.toBeInTheDocument()
  })

  it("disables inputs and buttons while a save is pending, so the user cannot double-submit", () => {
    const onCancel = vi.fn()
    render(<TidalDiamondForm onSubmit={vi.fn()} onCancel={onCancel} isPending />)
    expect(screen.getByLabelText(/name/i)).toBeDisabled()
    expect(screen.getByLabelText(/peak spring rate/i)).toBeDisabled()
    expect(screen.getByLabelText(/flood direction/i)).toBeDisabled()
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled()
  })

  it("disables the advanced per-hour rate inputs while pending", async () => {
    render(<TidalDiamondForm onSubmit={vi.fn()} isPending />)
    await userEvent.click(screen.getByRole("tab", { name: /advanced/i }))
    const firstRow = screen.getAllByTestId("diamond-hour-row")[0]
    for (const input of within(firstRow).getAllByRole("spinbutton")) {
      expect(input).toBeDisabled()
    }
  })
})
