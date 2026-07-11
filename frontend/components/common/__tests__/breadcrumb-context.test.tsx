import { describe, it, expect, vi } from "vitest"
import { render, screen, act } from "@testing-library/react"
import { renderHook } from "@testing-library/react"
import { createElement } from "react"
import { BreadcrumbProvider, useBreadcrumbContext } from "../breadcrumb-context"

describe("BreadcrumbProvider / useBreadcrumbContext", () => {
  it("defaults crumbs to an empty array", () => {
    const { result } = renderHook(() => useBreadcrumbContext(), {
      wrapper: ({ children }) => createElement(BreadcrumbProvider, null, children),
    })
    expect(result.current.crumbs).toEqual([])
  })

  it("updates crumbs via setCrumbs", () => {
    const { result } = renderHook(() => useBreadcrumbContext(), {
      wrapper: ({ children }) => createElement(BreadcrumbProvider, null, children),
    })
    act(() => result.current.setCrumbs([{ label: "Trips" }]))
    expect(result.current.crumbs).toEqual([{ label: "Trips" }])
  })

  it("throws when used outside a BreadcrumbProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    function Probe() {
      useBreadcrumbContext()
      return null
    }
    expect(() => render(createElement(Probe))).toThrow(
      "useBreadcrumbContext must be used within a BreadcrumbProvider.",
    )
    consoleError.mockRestore()
  })

  it("consumers re-render with the updated value", () => {
    function Probe() {
      const { crumbs, setCrumbs } = useBreadcrumbContext()
      return createElement(
        "button",
        { onClick: () => setCrumbs([{ label: "Trips" }]) },
        crumbs.length === 0 ? "empty" : crumbs[0].label,
      )
    }
    function Harness() {
      return createElement(BreadcrumbProvider, null, createElement(Probe))
    }
    render(createElement(Harness))
    expect(screen.getByText("empty")).toBeInTheDocument()
  })
})
