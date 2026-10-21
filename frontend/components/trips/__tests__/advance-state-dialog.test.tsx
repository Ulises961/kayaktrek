import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))
vi.mock("@/lib/trips/actions", () => ({ advanceState: vi.fn() }))

import { AdvanceStateDialog, nextStateStep } from "../advance-state-dialog"
import { advanceState } from "@/lib/trips/actions"
import { TRIP_STATE, type TripState } from "@/lib/dtos/trip"

const TRIP_ID = "019f7ef9-9c12-7cbc-95fe-7bfb29645b23"

function renderDialog(currentState: TripState, open = true) {
  const onOpenChange = vi.fn()
  const { container } = render(
    <AdvanceStateDialog
      tripId={TRIP_ID}
      currentState={currentState}
      open={open}
      onOpenChange={onOpenChange}
    />,
  )
  return { container, onOpenChange }
}

beforeEach(() => vi.clearAllMocks())

describe("nextStateStep", () => {
  it("names the step that follows each state, and none once the trip is past", () => {
    expect(nextStateStep(TRIP_STATE.BUILDING)).toMatchObject({
      state: TRIP_STATE.HAPPENING,
      label: "Begin expedition",
    })
    expect(nextStateStep(TRIP_STATE.HAPPENING)).toMatchObject({
      state: TRIP_STATE.PAST,
      label: "Mark as past",
    })
    expect(nextStateStep(TRIP_STATE.PAST)).toBeNull()
    expect(nextStateStep(null)).toBeNull()
    expect(nextStateStep(undefined)).toBeNull()
  })
})

describe("AdvanceStateDialog", () => {
  it("renders nothing while closed", () => {
    renderDialog(TRIP_STATE.BUILDING, false)
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("is titled with the step it takes, and says it cannot be undone", () => {
    renderDialog(TRIP_STATE.BUILDING)
    expect(screen.getByText("Begin expedition")).toBeInTheDocument()
    expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument()
  })

  it("moves the trip to the next state once confirmed, then refreshes the page", async () => {
    vi.mocked(advanceState).mockResolvedValue({ success: true })
    const { onOpenChange } = renderDialog(TRIP_STATE.HAPPENING)

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }))

    expect(advanceState).toHaveBeenCalledWith(TRIP_ID, TRIP_STATE.PAST)
    expect(refresh).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("leaves the trip where it is when cancelled", async () => {
    const { onOpenChange } = renderDialog(TRIP_STATE.BUILDING)

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(advanceState).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("offers no transition once the trip is past", () => {
    const { container } = renderDialog(TRIP_STATE.PAST)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })
})
