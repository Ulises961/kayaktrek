import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

import { FieldLabel, FieldError, NativeSelect } from "../form-field"

describe("FieldLabel", () => {
  it("renders a label associated with a control", () => {
    render(
      <>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <input id="name" />
      </>,
    )
    expect(screen.getByLabelText("Name")).toBeDefined()
  })

  it("merges extra classes", () => {
    render(<FieldLabel className="sm:text-[12px]">Crew</FieldLabel>)
    const label = screen.getByText("Crew")
    expect(label.className).toContain("uppercase")
    expect(label.className).toContain("sm:text-[12px]")
  })
})

describe("FieldError", () => {
  it("renders the message", () => {
    render(<FieldError message="Required field." />)
    expect(screen.getByText("Required field.")).toBeDefined()
  })

  it("renders nothing without a message", () => {
    const { container } = render(<FieldError message={undefined} />)
    expect(container.innerHTML).toBe("")
  })
})

describe("NativeSelect", () => {
  it("renders options and forwards props", () => {
    render(
      <NativeSelect aria-label="Type" defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </NativeSelect>,
    )
    const select = screen.getByLabelText("Type") as HTMLSelectElement
    expect(select.value).toBe("b")
  })
})
