import { describe, it, expect } from "vitest"
import { useEffect } from "react"
import { render, screen } from "@testing-library/react"
import { ContentArea } from "../content-area"
import { ContentAreaProvider, useContentArea } from "../content-area-context"

function FullBleedSetter() {
  const { setFullBleed } = useContentArea()
  useEffect(() => {
    setFullBleed(true)
  }, [setFullBleed])
  return null
}

describe("ContentArea", () => {
  it("renders children padded by default", () => {
    render(
      <ContentAreaProvider>
        <ContentArea>
          <span>child</span>
        </ContentArea>
      </ContentAreaProvider>,
    )
    expect(screen.getByText("child").parentElement).toHaveClass("p-6")
  })

  it("drops padding and adds relative positioning in full-bleed mode", () => {
    render(
      <ContentAreaProvider>
        <FullBleedSetter />
        <ContentArea>
          <span>child</span>
        </ContentArea>
      </ContentAreaProvider>,
    )
    const wrapper = screen.getByText("child").parentElement
    expect(wrapper).toHaveClass("relative")
    expect(wrapper).not.toHaveClass("p-6")
  })
})
