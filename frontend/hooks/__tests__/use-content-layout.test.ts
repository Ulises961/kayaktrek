import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useContentLayout } from "../use-content-layout"

const { mockSetLayout } = vi.hoisted(() => ({ mockSetLayout: vi.fn() }))

vi.mock("@/components/common/content-area-context", () => ({
  useContentArea: () => ({ layout: "column", setLayout: mockSetLayout }),
}))

describe("useContentLayout", () => {
  beforeEach(() => mockSetLayout.mockClear())

  it("applies the requested layout on mount", () => {
    renderHook(() => useContentLayout("bleed"))
    expect(mockSetLayout).toHaveBeenCalledWith("bleed")
  })

  it("restores the centred column on unmount", () => {
    // Without the reset, a page that never opts in inherits whatever the last
    // one set — the map builder would leave every subsequent page full-bleed.
    const { unmount } = renderHook(() => useContentLayout("wide"))
    mockSetLayout.mockClear()
    unmount()
    expect(mockSetLayout).toHaveBeenCalledWith("column")
  })
})
