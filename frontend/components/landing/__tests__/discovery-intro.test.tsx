import { describe, it, expect } from "vitest"
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DiscoveryIntro } from "../discovery-intro"

describe("DiscoveryIntro", () => {
  it("renders the pitch with a single Explore action", () => {
    render(<DiscoveryIntro />)
    expect(screen.getByText(/plan the passage/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /explore/i })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /sign up/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /log in/i })).not.toBeInTheDocument()
  })

  it("stays open on a click inside the card that isn't Explore", async () => {
    const user = userEvent.setup()
    render(<DiscoveryIntro />)
    await user.click(screen.getByText(/sea-kayak expedition planning/i))
    expect(screen.getByText(/plan the passage/i)).toBeInTheDocument()
  })

  it("dismisses after Explore is clicked", async () => {
    const user = userEvent.setup()
    render(<DiscoveryIntro />)
    await user.click(screen.getByRole("button", { name: /explore/i }))
    await waitForElementToBeRemoved(() => screen.queryByText(/plan the passage/i))
  })

  it("dismisses on a click outside the card, same as Explore", async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button type="button">Outside (the map, in practice)</button>
        <DiscoveryIntro />
      </div>,
    )
    await user.click(screen.getByRole("button", { name: /outside/i }))
    await waitForElementToBeRemoved(() => screen.queryByText(/plan the passage/i))
  })
})
