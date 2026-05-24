import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { PointDropPanel } from "../point-drop-panel"

describe("PointDropPanel", () => {
  it("renders all three type chips", () => {
    render(
      <PointDropPanel
        selectedType="position"
        onTypeChange={vi.fn()}
        onOk={vi.fn()}
        onUndo={vi.fn()}
      />
    )
    expect(screen.getByRole("button", { name: /stop/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /position/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /interest/i })).toBeTruthy()
  })

  it("calls onTypeChange with the clicked type", () => {
    const onTypeChange = vi.fn()
    render(
      <PointDropPanel
        selectedType="position"
        onTypeChange={onTypeChange}
        onOk={vi.fn()}
        onUndo={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /stop/i }))
    expect(onTypeChange).toHaveBeenCalledWith("stop")
  })

  it("calls onOk when OK is clicked", () => {
    const onOk = vi.fn()
    render(
      <PointDropPanel
        selectedType="position"
        onTypeChange={vi.fn()}
        onOk={onOk}
        onUndo={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /^ok$/i }))
    expect(onOk).toHaveBeenCalled()
  })

  it("calls onUndo when Undo is clicked", () => {
    const onUndo = vi.fn()
    render(
      <PointDropPanel
        selectedType="position"
        onTypeChange={vi.fn()}
        onOk={vi.fn()}
        onUndo={onUndo}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: /undo/i }))
    expect(onUndo).toHaveBeenCalled()
  })

  it("calls onOk when Escape is pressed", () => {
    const onOk = vi.fn()
    render(
      <PointDropPanel
        selectedType="position"
        onTypeChange={vi.fn()}
        onOk={onOk}
        onUndo={vi.fn()}
      />
    )
    fireEvent.keyDown(window, { key: "Escape" })
    expect(onOk).toHaveBeenCalled()
  })

  it("applies selected styling to the active chip", () => {
    render(
      <PointDropPanel
        selectedType="stop"
        onTypeChange={vi.fn()}
        onOk={vi.fn()}
        onUndo={vi.fn()}
      />
    )
    const stopBtn = screen.getByRole("button", { name: /stop/i })
    expect(stopBtn.className).toContain("bg-primary")
  })
})
