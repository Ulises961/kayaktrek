import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { AdvanceStateButton } from "../advance-state-button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { TRIP_STATE } from "@/lib/dtos/trip"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const TRIP_ID = "019f7ef9-9c12-7cbc-95fe-7bfb29645b23"

describe("AdvanceStateButton", () => {
  it("marks setting out as the call to action", () => {
    // The pivotal moment in the product — a plan becoming a live expedition — and it was
    // rendered `variant="outline"`, quieter than an ordinary button.
    render(<AdvanceStateButton tripId={TRIP_ID} currentState={TRIP_STATE.BUILDING} />)

    const button = screen.getByRole("button", { name: /begin expedition/i })
    for (const cls of ctaButtonClass.split(" ")) expect(button).toHaveClass(cls)
  })

  it("leaves closing the trip out quiet, so the pair reads as start versus finish", () => {
    // If both wore the CTA colour it would stop marking anything. This is the assertion
    // that keeps the promotion narrow.
    render(<AdvanceStateButton tripId={TRIP_ID} currentState={TRIP_STATE.HAPPENING} />)

    const button = screen.getByRole("button", { name: /mark as past/i })
    expect(button).not.toHaveClass("bg-accent")
  })

  it("offers no transition once the trip is past", () => {
    const { container } = render(
      <AdvanceStateButton tripId={TRIP_ID} currentState={TRIP_STATE.PAST} />,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
