"use client"
import { useState } from "react"
import { Plus, MapPin, Diamond } from "lucide-react"
import { cn } from "@/lib/utils"

export type MapAddControlProps = {
  // Places are itinerary-scoped; diamonds need a selected day (the caller folds
  // that gate into canAddDiamond).
  canAddPlace: boolean
  canAddDiamond: boolean
  // Non-null while the user is dropping a pin — the menu collapses to a prompt.
  placingMode: "place" | "diamond" | null
  onStartPlace: () => void
  onStartDiamond: () => void
  onCancel: () => void
}

// Top-centre "+ Add" disclosure, the create-action counterpart to the top-right
// Overlays (LayersControl) toggle. Mirrors its open/close mechanic: the menu items
// stay in the DOM (visibility-toggled) so each is addressable and gated on its own
// availability. While placing, the menu is replaced by a click-the-map prompt.
export function MapAddControl({
  canAddPlace,
  canAddDiamond,
  placingMode,
  onStartPlace,
  onStartDiamond,
  onCancel,
}: MapAddControlProps) {
  const [open, setOpen] = useState(false)

  if (placingMode) {
    return (
      <div className="absolute top-2 left-1/2 z-[1001] -translate-x-1/2">
        <div className="bg-card/95 ring-border/40 flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium shadow-md ring-1 backdrop-blur-sm">
          <span>
            {placingMode === "place"
              ? "Click the map to place the spot"
              : "Click the map to place the diamond"}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  const pick = (start: () => void) => () => {
    setOpen(false)
    start()
  }

  return (
    <div className="absolute top-2 left-1/2 z-[1001] -translate-x-1/2" data-testid="add-control">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="add-button"
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold shadow-md ring-1 backdrop-blur-sm transition-all",
          open
            ? "bg-card text-foreground ring-primary/50"
            : "bg-card/85 text-foreground ring-border/40",
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        Add
      </button>

      <div
        data-testid="add-panel"
        style={{ visibility: open ? "visible" : "hidden" }}
        className={cn(
          "bg-card ring-border/30 mt-1 w-40 overflow-hidden rounded-md shadow-lg ring-1 transition-all duration-150",
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="divide-border/20 flex flex-col divide-y">
          {canAddPlace && (
            <button
              type="button"
              data-testid="add-place-button"
              onClick={pick(onStartPlace)}
              className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium transition-colors"
            >
              <MapPin className="size-3.5 shrink-0 text-[#0e7490]" aria-hidden />
              Place
            </button>
          )}
          {canAddDiamond && (
            <button
              type="button"
              data-testid="add-diamond-button"
              onClick={pick(onStartDiamond)}
              className="hover:bg-muted/40 flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium transition-colors"
            >
              <Diamond className="size-3.5 shrink-0 text-[#f97316]" aria-hidden />
              Tidal diamond
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
