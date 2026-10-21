import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PositionConsentDialog, POSITION_SOURCE } from "../position-consent-dialog"

const SOURCES = [POSITION_SOURCE.DEVICE, POSITION_SOURCE.INREACH]

describe("PositionConsentDialog", () => {
  it.each(SOURCES)("does not render its content when closed (%s)", (source) => {
    render(
      <PositionConsentDialog
        source={source}
        open={false}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByText(/share your .* position/i)).not.toBeInTheDocument()
  })

  it("asks about the device's location and says it stops when Navigate is turned off", () => {
    render(
      <PositionConsentDialog
        source={POSITION_SOURCE.DEVICE}
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText(/share your live position/i)).toBeInTheDocument()
    expect(screen.getByText(/other members of this trip/i)).toBeInTheDocument()
    expect(screen.getByText(/shore contact/i)).toBeInTheDocument()
    expect(screen.getByText(/stops the moment you turn navigate off/i)).toBeInTheDocument()
  })

  it("asks about the inReach position, names who receives it and says when it stops", () => {
    render(
      <PositionConsentDialog
        source={POSITION_SOURCE.INREACH}
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText("Share your inReach position?")).toBeInTheDocument()
    expect(screen.getByText(/about every 10 minutes/i)).toBeInTheDocument()
    expect(screen.getByText(/other members of this trip/i)).toBeInTheDocument()
    expect(screen.getByText(/shore contact/i)).toBeInTheDocument()
    expect(screen.getByText(/turn this off or leave the trip/i)).toBeInTheDocument()
    // The device copy's promise would be false here: turning Navigate off does not stop an
    // inReach feed.
    expect(screen.queryByText(/turn navigate off/i)).not.toBeInTheDocument()
  })

  it.each(SOURCES)("calls onConfirm and closes when the user confirms (%s)", async (source) => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <PositionConsentDialog
        source={source}
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /start sharing/i }))

    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it.each(SOURCES)("does not call onConfirm when the user cancels (%s)", async (source) => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <PositionConsentDialog
        source={source}
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
