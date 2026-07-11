import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useBreadcrumbs } from "../use-breadcrumbs"

const { mockSetCrumbs } = vi.hoisted(() => ({ mockSetCrumbs: vi.fn() }))

vi.mock("@/components/common/breadcrumb-context", () => ({
  useBreadcrumbContext: () => ({ crumbs: [], setCrumbs: mockSetCrumbs }),
}))

describe("useBreadcrumbs", () => {
  beforeEach(() => mockSetCrumbs.mockClear())

  it("sets crumbs on mount", () => {
    renderHook(() => useBreadcrumbs([{ label: "Trips" }]))
    expect(mockSetCrumbs).toHaveBeenCalledWith([{ label: "Trips" }])
  })

  it("clears crumbs on unmount", () => {
    const { unmount } = renderHook(() => useBreadcrumbs([{ label: "Trips" }]))
    mockSetCrumbs.mockClear()
    unmount()
    expect(mockSetCrumbs).toHaveBeenCalledWith([])
  })

  it("updates crumbs when the crumbs value changes", () => {
    const { rerender } = renderHook(({ crumbs }) => useBreadcrumbs(crumbs), {
      initialProps: { crumbs: [{ label: "Trips" }] },
    })
    mockSetCrumbs.mockClear()
    rerender({ crumbs: [{ label: "Trips" }, { label: "Cinque Terre" }] })
    expect(mockSetCrumbs).toHaveBeenCalledWith([{ label: "Trips" }, { label: "Cinque Terre" }])
  })

  it("does not re-set crumbs when the same crumbs value is passed again", () => {
    const { rerender } = renderHook(({ crumbs }) => useBreadcrumbs(crumbs), {
      initialProps: { crumbs: [{ label: "Trips" }] },
    })
    mockSetCrumbs.mockClear()
    rerender({ crumbs: [{ label: "Trips" }] })
    expect(mockSetCrumbs).not.toHaveBeenCalled()
  })
})
