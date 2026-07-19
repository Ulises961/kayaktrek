import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RequestsMenu } from "../requests-menu"

function renderMenu(pendingRequests: {
  tripInvitations: number
  buddyRequests: number
  endorsementRequests: number
}) {
  return render(<RequestsMenu pendingRequests={pendingRequests} />)
}

describe("RequestsMenu", () => {
  it("shows no count badge when there are no pending requests", () => {
    renderMenu({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })

  it("shows the combined count as a badge", () => {
    renderMenu({ tripInvitations: 2, buddyRequests: 1, endorsementRequests: 0 })
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("lists only nonzero request types, each linking to its home page", async () => {
    renderMenu({ tripInvitations: 2, buddyRequests: 0, endorsementRequests: 1 })
    await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))

    const tripLink = await screen.findByRole("menuitem", { name: /2 trip invitations/i })
    expect(tripLink.closest("a")).toHaveAttribute("href", "/invitations")

    const endorsementLink = screen.getByRole("menuitem", { name: /1 endorsement request/i })
    expect(endorsementLink.closest("a")).toHaveAttribute("href", "/logs")

    expect(screen.queryByText(/buddy request/i)).not.toBeInTheDocument()
  })

  it("shows a 'no pending requests' row when everything is zero", async () => {
    renderMenu({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })
    await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))
    expect(await screen.findByText(/no pending requests/i)).toBeInTheDocument()
  })
})
