import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook } from "@testing-library/react"
import { useFullBleedContent } from "../use-full-bleed-content"

const { mockSetFullBleed } = vi.hoisted(() => ({ mockSetFullBleed: vi.fn() }))

vi.mock("@/components/common/content-area-context", () => ({
  useContentArea: () => ({ fullBleed: false, setFullBleed: mockSetFullBleed }),
}))

describe("useFullBleedContent", () => {
  beforeEach(() => mockSetFullBleed.mockClear())

  it("sets full-bleed on mount", () => {
    renderHook(() => useFullBleedContent())
    expect(mockSetFullBleed).toHaveBeenCalledWith(true)
  })

  it("restores padded content on unmount", () => {
    const { unmount } = renderHook(() => useFullBleedContent())
    mockSetFullBleed.mockClear()
    unmount()
    expect(mockSetFullBleed).toHaveBeenCalledWith(false)
  })
})
