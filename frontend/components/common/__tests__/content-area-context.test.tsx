import { describe, it, expect, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { renderHook } from "@testing-library/react"
import { createElement } from "react"
import { ContentAreaProvider, useContentArea } from "../content-area-context"

describe("ContentAreaProvider / useContentArea", () => {
  it("defaults fullBleed to false", () => {
    const { result } = renderHook(() => useContentArea(), {
      wrapper: ({ children }) => createElement(ContentAreaProvider, null, children),
    })
    expect(result.current.fullBleed).toBe(false)
  })

  it("updates fullBleed via setFullBleed", () => {
    const { result } = renderHook(() => useContentArea(), {
      wrapper: ({ children }) => createElement(ContentAreaProvider, null, children),
    })
    act(() => result.current.setFullBleed(true))
    expect(result.current.fullBleed).toBe(true)
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
      const { fullBleed } = useContentArea()
      return createElement("span", null, fullBleed ? "full-bleed" : "padded")
    }
    function Harness() {
      return createElement(ContentAreaProvider, null, createElement(Probe))
    }
    render(createElement(Harness))
    expect(screen.getByText("padded")).toBeInTheDocument()
  })
})
