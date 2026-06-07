import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useCollapseSidebar } from "../use-collapse-sidebar"

const { mockSetOpen } = vi.hoisted(() => ({ mockSetOpen: vi.fn() }))

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ open: true, setOpen: mockSetOpen }),
}))

describe("useCollapseSidebar", () => {
  beforeEach(() => mockSetOpen.mockClear())

  it("collapses the sidebar on mount", () => {
    renderHook(() => useCollapseSidebar())
    expect(mockSetOpen).toHaveBeenCalledWith(false)
  })

  it("restores the previous open state on unmount", () => {
    const { unmount } = renderHook(() => useCollapseSidebar())
    mockSetOpen.mockClear()
    unmount()
    expect(mockSetOpen).toHaveBeenCalledWith(true)
  })
})
