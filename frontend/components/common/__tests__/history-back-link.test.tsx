import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockBack = vi.fn()
const mockPush = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }))

import { HistoryBackLink } from "../history-back-link"

function setHistoryLength(length: number) {
  vi.spyOn(window.history, "length", "get").mockReturnValue(length)
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe("HistoryBackLink", () => {
  it("goes back when the tab has somewhere to go back to", async () => {
    setHistoryLength(3)
    render(<HistoryBackLink />)

    await userEvent.click(screen.getByRole("link", { name: /back/i }))

    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("goes home when the page is the tab's first entry, e.g. opened from the mobile app", async () => {
    setHistoryLength(1)
    render(<HistoryBackLink />)

    await userEvent.click(screen.getByRole("link", { name: /back/i }))

    expect(mockPush).toHaveBeenCalledWith("/")
    expect(mockBack).not.toHaveBeenCalled()
  })

  it("stays a link to home, so it still works without script", () => {
    setHistoryLength(1)
    render(<HistoryBackLink />)
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/")
  })
})
