"use client"
import { ImageIcon } from "lucide-react"
import type { Point } from "@/lib/dtos/point"

type ImageGalleryProps = {
  images: NonNullable<Point["images"]>
  onRemove: (imageId: string) => void
}

export function ImageGallery({ images, onRemove }: ImageGalleryProps) {
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {images.map((img) => (
        <div key={img.id} className="relative group w-12 h-12 rounded overflow-hidden bg-muted border border-border/40 shrink-0">
          {img.location ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.location} alt={img.name ?? ""} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon size={16} className="text-muted-foreground" />
            </div>
          )}
          <button
            aria-label={`Remove image ${img.name ?? ""}`}
            onClick={() => onRemove(img.id!)}
            className="absolute inset-0 bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          >
            ×
          </button>
        </div>
      ))}
      <button
        disabled
        title="Photo upload coming in a future update"
        className="w-12 h-12 rounded border border-dashed border-border/60 flex items-center justify-center text-muted-foreground/40 cursor-not-allowed"
        aria-label="Add photo (coming soon)"
      >
        <ImageIcon size={14} />
      </button>
    </div>
  )
}
