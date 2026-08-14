import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CarIcon } from "lucide-react"

import { Dialog } from "@/components/ui/dialog"
import { AccentDialogContent } from "../accent-dialog"

describe("AccentDialogContent", () => {
  it("renders the title with the icon and the body content", () => {
    render(
      <Dialog open>
        <AccentDialogContent icon={CarIcon} title="Add vehicle">
          <p>Body content</p>
        </AccentDialogContent>
      </Dialog>,
    )
    expect(screen.getByRole("dialog")).toBeDefined()
    expect(screen.getByText("Add vehicle")).toBeDefined()
    expect(screen.getByText("Body content")).toBeDefined()
  })

  it("carries the shared chart rule, not a per-dialog colour", () => {
    // The rule is the app's fixed chrome, so it must come from the `.chart-top-rule`
    // class every card uses — not an inline colour a call site chose. Ten dialogs
    // picking their own tint is what spent the role hues on decoration.
    render(
      <Dialog open>
        <AccentDialogContent icon={CarIcon} title="Edit document">
          <p>Body</p>
        </AccentDialogContent>
      </Dialog>,
    )
    const bar = screen.getByTestId("accent-dialog-bar")
    expect(bar).toHaveClass("chart-top-rule")
    expect(bar.style.backgroundColor).toBe("")
  })

  it("leaves the title icon neutral rather than tinting it with a role colour", () => {
    // The icon used to take the same per-dialog colour as the bar. Neutral keeps amber
    // and teal rare enough to mean something where they are load-bearing.
    render(
      <Dialog open>
        <AccentDialogContent icon={CarIcon} title="Add vehicle">
          <p>Body</p>
        </AccentDialogContent>
      </Dialog>,
    )
    const icon = screen.getByRole("dialog").querySelector("svg")
    expect(icon).toHaveClass("text-muted-foreground")
    expect(icon?.getAttribute("style")).toBeNull()
  })
})
