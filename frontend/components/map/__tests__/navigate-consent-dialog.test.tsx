import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { NavigateConsentDialog } from "../navigate-consent-dialog"

describe("NavigateConsentDialog", () => {
  it("does not render its content when closed", () => {
    render(<NavigateConsentDialog open={false} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.queryByText(/share your live position/i)).not.toBeInTheDocument()
  })

  it("names who receives the position when open", () => {
    render(<NavigateConsentDialog open={true} onOpenChange={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText(/share your live position/i)).toBeInTheDocument()
    expect(screen.getByText(/other members of this trip/i)).toBeInTheDocument()
    expect(screen.getByText(/shore contact/i)).toBeInTheDocument()
    expect(screen.getByText(/stops the moment you turn navigate off/i)).toBeInTheDocument()
  })

  it("calls onConfirm and closes when the user confirms", async () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(<NavigateConsentDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("does not call onConfirm when the user cancels", async () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(<NavigateConsentDialog open={true} onOpenChange={onOpenChange} onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
