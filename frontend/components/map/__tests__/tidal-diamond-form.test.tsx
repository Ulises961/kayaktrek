import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TidalDiamondForm } from "../tidal-diamond-form"

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

  it("calls onCancel from the cancel button", async () => {
    const onCancel = vi.fn()
    render(<TidalDiamondForm onSubmit={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
