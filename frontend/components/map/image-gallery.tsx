"use client"
import { ImageIcon } from "lucide-react"
import type { Point } from "@/lib/dtos/point"

type ImageGalleryProps = {
  images: NonNullable<Point["images"]>
  onRemove: (imageId: string) => void
}

export function ImageGallery({ images, onRemove }: ImageGalleryProps) {
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
          <button
            aria-label={`Remove image ${img.name ?? ""}`}
            onClick={() => onRemove(img.id!)}
            className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
          >
            ×
          </button>
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
