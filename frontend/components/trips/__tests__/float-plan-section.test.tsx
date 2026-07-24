import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FloatPlanSection } from "../float-plan-section"

describe("FloatPlanSection", () => {
  it("renders its content expanded by default", () => {
    render(
      <FloatPlanSection title="Shore Contact" icon={<span />}>
        <p>Jane Doe</p>
      </FloatPlanSection>,
    )
    expect(screen.getByText("Jane Doe")).toBeVisible()
  })

  it("shows the section title", () => {
    render(
      <FloatPlanSection title="Crew Manifest (3)" icon={<span />}>
        <p>content</p>
      </FloatPlanSection>,
    )
    expect(screen.getByText("Crew Manifest (3)")).toBeInTheDocument()
  })

  it("collapses on click and expands again on a second click", async () => {
    render(
      <FloatPlanSection title="Shore Contact" icon={<span />}>
        <p>Jane Doe</p>
      </FloatPlanSection>,
    )
    const trigger = screen.getByRole("button", { name: "Shore Contact" })
    expect(trigger).toHaveAttribute("aria-expanded", "true")

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "false")

    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
  })

  // forceMount keeps content mounted (never unmounted) even while collapsed —
  // required so the @media print override in globals.css can force it back
  // to visible; a printed float plan must show every section regardless of
  // on-screen collapse state. This asserts the mounted-content half of that
  // contract; the print CSS override itself isn't exercisable from jsdom.
  it("keeps collapsed content mounted in the DOM rather than removing it", async () => {
    render(
      <FloatPlanSection title="Shore Contact" icon={<span />}>
        <p>Jane Doe</p>
      </FloatPlanSection>,
    )
    await userEvent.click(screen.getByRole("button", { name: "Shore Contact" }))
    expect(screen.getByText("Jane Doe")).toBeInTheDocument()
  })
})
