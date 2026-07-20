import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PasswordInput } from "../password-input"

describe("PasswordInput", () => {
  it("renders a masked input with a show-password toggle", () => {
    render(<PasswordInput aria-label="Password" />)
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password")
    const toggle = screen.getByRole("button", { name: "Show password" })
    expect(toggle.getAttribute("aria-pressed")).toBe("false")
  })

  it("reveals and re-masks the value on toggle", async () => {
    const user = userEvent.setup()
    render(<PasswordInput aria-label="Password" defaultValue="hunter2" />)

    await user.click(screen.getByRole("button", { name: "Show password" }))
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text")

    await user.click(screen.getByRole("button", { name: "Hide password" }))
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password")
  })

  it("never submits the surrounding form", async () => {
    const user = userEvent.setup()
    let submitted = false
    render(
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submitted = true
        }}
      >
        <PasswordInput aria-label="Password" />
      </form>,
    )
    await user.click(screen.getByRole("button", { name: "Show password" }))
    expect(submitted).toBe(false)
  })

  it("disables the toggle alongside the input and passes props through", () => {
    render(<PasswordInput aria-label="Password" disabled autoComplete="new-password" />)
    const input = screen.getByLabelText("Password")
    expect(input.hasAttribute("disabled")).toBe(true)
    expect(input.getAttribute("autocomplete")).toBe("new-password")
    expect(
      (screen.getByRole("button", { name: "Show password" }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
