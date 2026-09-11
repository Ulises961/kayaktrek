import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { WindDiamondForm } from "../wind-diamond-form"

describe("WindDiamondForm", () => {
  it("renders the name and notes fields", () => {
    render(<WindDiamondForm onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument()
  })

  it("submits with both fields blank — name and notes are optional", async () => {
    const onSubmit = vi.fn()
    render(<WindDiamondForm onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })

  it("submits the entered name and notes", async () => {
    const onSubmit = vi.fn()
    render(<WindDiamondForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText(/name/i), "Funnel off the ridge")
    await userEvent.type(screen.getByLabelText(/notes/i), "Katabatic gusts on NW flow")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: "Funnel off the ridge",
      notes: "Katabatic gusts on NW flow",
    })
  })

  it("blocks submission and surfaces an error when the name is too long", async () => {
    const onSubmit = vi.fn()
    render(<WindDiamondForm onSubmit={onSubmit} />)
    await userEvent.type(screen.getByLabelText(/name/i), "x".repeat(256))
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText(/name is too long/i)).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("prefills from values for the edit flow", () => {
    render(
      <WindDiamondForm
        values={{ name: "Existing gap", notes: "Known from last trip" }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/name/i)).toHaveValue("Existing gap")
    expect(screen.getByLabelText(/notes/i)).toHaveValue("Known from last trip")
  })

  it("calls onCancel from the cancel button", async () => {
    const onCancel = vi.fn()
    render(<WindDiamondForm onSubmit={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it("surfaces a server-side error message when the save fails", () => {
    render(<WindDiamondForm onSubmit={vi.fn()} error="Could not save wind diamond" />)
    expect(screen.getByText("Could not save wind diamond")).toBeInTheDocument()
  })

  it("shows no error text when error is null", () => {
    render(<WindDiamondForm onSubmit={vi.fn()} error={null} />)
    expect(screen.queryByText(/could not save/i)).not.toBeInTheDocument()
  })

  it("disables inputs and buttons while a save is pending, so the user cannot double-submit", () => {
    const onCancel = vi.fn()
    render(<WindDiamondForm onSubmit={vi.fn()} onCancel={onCancel} isPending />)
    expect(screen.getByLabelText(/name/i)).toBeDisabled()
    expect(screen.getByLabelText(/notes/i)).toBeDisabled()
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled()
  })
})
