"use client"
import { Eye, EyeOff, ImageIcon } from "lucide-react"
import type { Point } from "@/lib/dtos/point"

type ImageGalleryProps = {
  images: NonNullable<Point["images"]>
  onRemove: (imageId: string) => void
  onToggleVisibility: (imageId: string, isPublic: boolean) => void
}

export function ImageGallery({ images, onRemove, onToggleVisibility }: ImageGalleryProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {images.map((img) => (
        <div
          key={img.id}
          className="group bg-muted border-border/40 relative h-12 w-12 shrink-0 overflow-hidden rounded border"
        >
          {img.location ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.location} alt={img.name ?? ""} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon size={16} className="text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              aria-label={`Make ${img.name ?? "image"} ${img.isPublic ? "private" : "public"}`}
              onClick={() => onToggleVisibility(img.id!, !img.isPublic)}
              className="text-white/90 hover:text-white"
            >
              {img.isPublic ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              aria-label={`Remove image ${img.name ?? ""}`}
              onClick={() => onRemove(img.id!)}
              className="text-xs text-white/90 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button
        disabled
        title="Photo upload coming in a future update"
        className="border-border/60 text-muted-foreground/40 flex h-12 w-12 cursor-not-allowed items-center justify-center rounded border border-dashed"
        aria-label="Add photo (coming soon)"
      >
        <ImageIcon size={14} />
      </button>
    </div>
  )
}
