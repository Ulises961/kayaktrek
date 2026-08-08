import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { EmptyState } from "../empty-state"

describe("EmptyState", () => {
  it("renders the title and the description of what lands here", () => {
    render(<EmptyState title="No trips yet" description="Plan your first expedition." />)
    expect(screen.getByText("No trips yet")).toBeInTheDocument()
    expect(screen.getByText("Plan your first expedition.")).toBeInTheDocument()
  })

  it("renders the action that fills it when given one", () => {
    render(
      <EmptyState
        title="No trips yet"
        description="Plan your first expedition."
        action={<button>New trip</button>}
      />,
    )
    expect(screen.getByRole("button", { name: "New trip" })).toBeInTheDocument()
  })

  it("omits the action area entirely when there is nothing to do here", () => {
    const { container } = render(<EmptyState title="No crew yet" description="Invite paddlers." />)
    expect(container.querySelector("[data-slot='empty-state-action']")).toBeNull()
  })

  it("hides the ghost panel from assistive tech — it depicts nothing real", () => {
    const { container } = render(
      <EmptyState title="No logs yet" description="Record one." ghostRows={3} />,
    )
    const ghost = container.querySelector("[data-slot='empty-state-ghost']")
    expect(ghost).toHaveAttribute("aria-hidden", "true")
  })

  it("draws no ghost panel by default — the section icon is the anchor", () => {
    const { container } = render(<EmptyState title="No logs yet" description="Record one." />)
    expect(container.querySelector("[data-slot='empty-state-ghost']")).toBeNull()
  })

  it("renders the section icon it is given", () => {
    function KayakIcon({ className }: { className?: string }) {
      return <svg data-testid="section-icon" className={className} />
    }
    render(<EmptyState icon={KayakIcon} title="No trips yet" description="Plan one." />)
    expect(screen.getByTestId("section-icon")).toBeInTheDocument()
  })

  it("renders no icon when none is given", () => {
    const { container } = render(<EmptyState title="No trips yet" description="Plan one." />)
    expect(container.querySelector("svg")).toBeNull()
  })

  it("claims no outer margin of its own — the container owns the gap above it", () => {
    const { container } = render(<EmptyState title="No trips yet" description="Plan one." />)
    const panel = container.querySelector("[data-slot='empty-state']")
    // A baked-in margin collapses against a block sibling but *adds* to a flex
    // parent's gap, so the same panel sat at three different offsets depending
    // on which page rendered it.
    expect(panel?.className).not.toMatch(/\bmt-\d/)
  })

  it("draws one ghost row per requested row", () => {
    const { container } = render(
      <EmptyState title="No logs yet" description="Record one." ghostRows={5} />,
    )
    expect(container.querySelectorAll("[data-slot='empty-state-ghost-row']")).toHaveLength(5)
  })
})
