import { describe, it, expect, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { renderHook } from "@testing-library/react"
import { createElement } from "react"
import { ContentAreaProvider, useContentArea } from "../content-area-context"

describe("ContentAreaProvider / useContentArea", () => {
  it("defaults to the centred column", () => {
    const { result } = renderHook(() => useContentArea(), {
      wrapper: ({ children }) => createElement(ContentAreaProvider, null, children),
    })
    expect(result.current.layout).toBe("column")
  })

  it("updates the layout via setLayout", () => {
    const { result } = renderHook(() => useContentArea(), {
      wrapper: ({ children }) => createElement(ContentAreaProvider, null, children),
    })
    act(() => result.current.setLayout("bleed"))
    expect(result.current.layout).toBe("bleed")
  })

  it("throws when used outside a ContentAreaProvider", () => {
    // Swallow the expected console.error from React's error boundary logging.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    function Probe() {
      useContentArea()
      return null
    }
    expect(() => render(createElement(Probe))).toThrow(
      "useContentArea must be used within a ContentAreaProvider.",
    )
    consoleError.mockRestore()
  })

  it("consumers re-render with the updated value", () => {
    function Probe() {
      const { layout } = useContentArea()
      return createElement("span", null, layout)
    }
    function Harness() {
      return createElement(ContentAreaProvider, null, createElement(Probe))
    }
    render(createElement(Harness))
    expect(screen.getByText("column")).toBeInTheDocument()
  })
})
