import { describe, it, expect } from "vitest"
import { useEffect } from "react"
import { render, screen } from "@testing-library/react"
import { ContentArea } from "../content-area"
import { ContentAreaProvider, useContentArea } from "../content-area-context"
import type { ContentLayout } from "../content-area-context"

function LayoutSetter({ layout }: { layout: ContentLayout }) {
  const { setLayout } = useContentArea()
  useEffect(() => {
    setLayout(layout)
  }, [setLayout, layout])
  return null
}

function renderArea(layout?: ContentLayout) {
  render(
    <ContentAreaProvider>
      {layout && <LayoutSetter layout={layout} />}
      <ContentArea>
        <span>child</span>
      </ContentArea>
    </ContentAreaProvider>,
  )
  return screen.getByText("child").parentElement
}

describe("ContentArea", () => {
  it("caps the column width against the left margin by default", () => {
    const wrapper = renderArea()
    expect(wrapper).toHaveClass("max-w-2xl")
    expect(wrapper).toHaveClass("p-6")
    // Left-aligned, so the page title starts at the same x in every mode.
    expect(wrapper).not.toHaveClass("mx-auto")
  })

  it("drops the cap but keeps padding in wide mode", () => {
    const wrapper = renderArea("wide")
    expect(wrapper).toHaveClass("p-6")
    expect(wrapper).not.toHaveClass("max-w-2xl")
  })

  it("drops padding and adds relative positioning in bleed mode", () => {
    const wrapper = renderArea("bleed")
    expect(wrapper).toHaveClass("relative")
    expect(wrapper).not.toHaveClass("p-6")
    expect(wrapper).not.toHaveClass("max-w-2xl")
  })

  it("stacks a page's sections on one vertical rhythm in column mode", () => {
    const wrapper = renderArea()
    expect(wrapper).toHaveClass("flex")
    expect(wrapper).toHaveClass("flex-col")
    expect(wrapper).toHaveClass("gap-6")
  })

  it("keeps that same rhythm in wide mode", () => {
    const wrapper = renderArea("wide")
    expect(wrapper).toHaveClass("flex")
    expect(wrapper).toHaveClass("flex-col")
    expect(wrapper).toHaveClass("gap-6")
  })

  it("imposes no rhythm in bleed mode — the map is the page, not a stack", () => {
    const wrapper = renderArea("bleed")
    expect(wrapper).not.toHaveClass("gap-6")
  })
})
