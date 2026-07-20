import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { SaveStatusLine } from "../save-status-line"

describe("SaveStatusLine", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<SaveStatusLine status="idle" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows 'Saving…' while saving", () => {
    render(<SaveStatusLine status="saving" />)
    expect(screen.getByText("Saving…")).toBeInTheDocument()
  })

  it("shows 'Saved' once saved", () => {
    render(<SaveStatusLine status="saved" />)
    expect(screen.getByText(/saved/i)).toBeInTheDocument()
  })
})
