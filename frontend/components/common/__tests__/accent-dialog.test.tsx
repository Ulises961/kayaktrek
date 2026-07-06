import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CarIcon } from "lucide-react"

import { Dialog } from "@/components/ui/dialog"
import { AccentDialogContent } from "../accent-dialog"
import { palette } from "@/lib/tokens"

describe("AccentDialogContent", () => {
  it("renders the title with the icon and the body content", () => {
    render(
      <Dialog open>
        <AccentDialogContent accent={palette.ocean500} icon={CarIcon} title="Add vehicle">
          <p>Body content</p>
        </AccentDialogContent>
      </Dialog>,
    )
    expect(screen.getByRole("dialog")).toBeDefined()
    expect(screen.getByText("Add vehicle")).toBeDefined()
    expect(screen.getByText("Body content")).toBeDefined()
  })

  it("paints the accent bar with the given color", () => {
    render(
      <Dialog open>
        <AccentDialogContent accent={palette.foam400} icon={CarIcon} title="Edit document">
          <p>Body</p>
        </AccentDialogContent>
      </Dialog>,
    )
    const bar = screen.getByTestId("accent-dialog-bar")
    expect(bar.style.backgroundColor).not.toBe("")
  })
})
