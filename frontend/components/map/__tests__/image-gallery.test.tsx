import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ImageGallery } from "../image-gallery"
import type { Point } from "@/lib/dtos/point"

const IMAGES: NonNullable<Point["images"]> = [
  { id: "i1", location: "https://example.com/1.jpg", name: "one", size: 1000, isPublic: false },
  { id: "i2", location: "https://example.com/2.jpg", name: "two", size: 2000, isPublic: true },
]

describe("ImageGallery", () => {
  it("renders a thumbnail for each image", () => {
    render(<ImageGallery images={IMAGES} onRemove={vi.fn()} onToggleVisibility={vi.fn()} />)
    expect(screen.getAllByRole("img")).toHaveLength(2)
  })

  it("calls onRemove with the image id when the remove button is clicked", () => {
    const onRemove = vi.fn()
    render(<ImageGallery images={IMAGES} onRemove={onRemove} onToggleVisibility={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /remove image one/i }))
    expect(onRemove).toHaveBeenCalledWith("i1")
  })

  it("labels a private image's toggle as 'make public' and calls onToggleVisibility(true)", () => {
    const onToggleVisibility = vi.fn()
    render(
      <ImageGallery images={IMAGES} onRemove={vi.fn()} onToggleVisibility={onToggleVisibility} />,
    )
    fireEvent.click(screen.getByRole("button", { name: /make one public/i }))
    expect(onToggleVisibility).toHaveBeenCalledWith("i1", true)
  })

  it("labels a public image's toggle as 'make private' and calls onToggleVisibility(false)", () => {
    const onToggleVisibility = vi.fn()
    render(
      <ImageGallery images={IMAGES} onRemove={vi.fn()} onToggleVisibility={onToggleVisibility} />,
    )
    fireEvent.click(screen.getByRole("button", { name: /make two private/i }))
    expect(onToggleVisibility).toHaveBeenCalledWith("i2", false)
  })
})
