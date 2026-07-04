import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { DocumentForm } from "../document-form"

describe("DocumentForm", () => {
  it("submits typed fields", async () => {
    const onSubmit = vi.fn()
    render(<DocumentForm submitLabel="Add" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByPlaceholderText(/document name/i), "Ferry booking")
    await userEvent.selectOptions(screen.getByLabelText(/type/i), "transport")
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const fields = onSubmit.mock.calls[0][0]
    expect(fields.name).toBe("Ferry booking")
    expect(fields.type).toBe("transport")
  })

  it("shows a validation error when the name is missing", async () => {
    const onSubmit = vi.fn()
    render(<DocumentForm submitLabel="Add" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeDefined())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("pre-fills from values", () => {
    render(
      <DocumentForm
        submitLabel="Save"
        values={{
          type: "permit",
          name: "Marine reserve permit",
          date: "2026-07-01",
          expiryDate: "",
          confirmationNumber: "ABC-1",
          url: "",
          notes: "",
        }}
        onSubmit={vi.fn()}
      />,
    )
    expect((screen.getByPlaceholderText(/document name/i) as HTMLInputElement).value).toBe(
      "Marine reserve permit",
    )
    expect((screen.getByLabelText(/type/i) as HTMLSelectElement).value).toBe("permit")
  })

  it("renders the attachment slot and a root error", () => {
    render(
      <DocumentForm
        submitLabel="Save"
        error="Trip is over."
        attachmentSlot={<span>attachment widget</span>}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByText("attachment widget")).toBeDefined()
    expect(screen.getByText("Trip is over.")).toBeDefined()
  })
})
