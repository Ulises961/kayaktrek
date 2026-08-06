import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { PlaceForm } from "../place-form"
import type { PlaceCategory } from "@/lib/dtos/place"

const CATEGORIES: PlaceCategory[] = [
  {
    id: "01952f1a-0000-7000-8000-0000000000c0",
    slug: "freshwater",
    name: "Freshwater",
    icon: "droplet",
  },
  {
    id: "01952f1a-0000-7000-8000-0000000000c1",
    slug: "hazard",
    name: "Hazard",
    icon: "triangle-alert",
  },
]

describe("PlaceForm", () => {
  it("renders the category select, label and note fields", () => {
    render(<PlaceForm categories={CATEGORIES} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/label/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/note/i)).toBeInTheDocument()
  })

  it("blocks submission and surfaces an error for an empty label", async () => {
    const onSubmit = vi.fn()
    render(<PlaceForm categories={CATEGORIES} onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText(/label is required/i)).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("submits the chosen category, label and note", async () => {
    const onSubmit = vi.fn()
    render(<PlaceForm categories={CATEGORIES} onSubmit={onSubmit} />)

    await userEvent.selectOptions(screen.getByLabelText(/category/i), CATEGORIES[1].id)
    await userEvent.type(screen.getByLabelText(/label/i), "Overfalls at the headland")
    await userEvent.type(screen.getByLabelText(/note/i), "Avoid mid-ebb")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      categoryId: CATEGORIES[1].id,
      label: "Overfalls at the headland",
      note: "Avoid mid-ebb",
    })
  })

  it("prefills from values for the edit flow", () => {
    render(
      <PlaceForm
        categories={CATEGORIES}
        values={{ categoryId: CATEGORIES[1].id, label: "Existing hazard", note: null }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByLabelText(/label/i)).toHaveValue("Existing hazard")
    expect(screen.getByLabelText(/category/i)).toHaveValue(CATEGORIES[1].id)
  })

  it("calls onCancel from the cancel button", async () => {
    const onCancel = vi.fn()
    render(<PlaceForm categories={CATEGORIES} onSubmit={vi.fn()} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it("surfaces a server-side error message when the save fails", () => {
    render(<PlaceForm categories={CATEGORIES} onSubmit={vi.fn()} error="Could not save place" />)
    expect(screen.getByText("Could not save place")).toBeInTheDocument()
  })

  it("shows no error text when error is null", () => {
    render(<PlaceForm categories={CATEGORIES} onSubmit={vi.fn()} error={null} />)
    expect(screen.queryByText(/could not save/i)).not.toBeInTheDocument()
  })

  it("disables inputs and buttons while a save is pending, so the user cannot double-submit", () => {
    const onCancel = vi.fn()
    render(<PlaceForm categories={CATEGORIES} onSubmit={vi.fn()} onCancel={onCancel} isPending />)
    expect(screen.getByLabelText(/category/i)).toBeDisabled()
    expect(screen.getByLabelText(/label/i)).toBeDisabled()
    expect(screen.getByLabelText(/note/i)).toBeDisabled()
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled()
  })
})
