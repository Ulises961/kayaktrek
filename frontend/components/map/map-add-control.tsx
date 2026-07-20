"use client"
import { useState } from "react"
import { Plus, MapPin, Diamond, ChevronDown } from "lucide-react"
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

// Top-centre "Annotate" disclosure, the create-action counterpart to the top-right
// Overlays (LayersControl) toggle. Mirrors its open/close mechanic: the menu items
// stay in the DOM (visibility-toggled) so each is addressable and gated on its own
// availability. While placing, the menu is replaced by a click-the-map prompt.
// Named "Annotate" (not "Add") since route points — the other thing you can add to
// the map — are created by clicking the map directly, not through this control.
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
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold shadow-md ring-1 backdrop-blur-sm transition-all",
          open
            ? "bg-card text-foreground ring-primary/50"
            : "bg-card/85 text-foreground ring-border/40",
        )}
      >
        <Plus className="size-3.5" aria-hidden />
        Annotate
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
          aria-hidden
        />
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
          <button
            type="button"
            data-testid="add-place-button"
            disabled={!canAddPlace}
            onClick={canAddPlace ? pick(onStartPlace) : undefined}
            className="hover:enabled:bg-muted/40 flex w-full items-start gap-2 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#0e7490]" aria-hidden />
            <span className="flex flex-col">
              <span className="text-[11px] font-medium">Place</span>
              <span className="text-muted-foreground text-[10px]">
                Add a point of interest anyone viewing this trip&apos;s map can see.
              </span>
            </span>
          </button>
          <button
            type="button"
            data-testid="add-diamond-button"
            disabled={!canAddDiamond}
            onClick={canAddDiamond ? pick(onStartDiamond) : undefined}
            className="hover:enabled:bg-muted/40 flex w-full items-start gap-2 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Diamond className="mt-0.5 size-3.5 shrink-0 text-[#f97316]" aria-hidden />
            <span className="flex flex-col">
              <span className="text-[11px] font-medium">Tidal diamond</span>
              <span className="text-muted-foreground text-[10px]">
                {canAddDiamond
                  ? "Add a manual tide entry for the selected day."
                  : "Select a day first."}
              </span>
            </span>
          </button>
        </div>
        <p className="text-muted-foreground border-border/20 border-t px-3 py-2 text-[10px] italic">
          Route points: click the map.
        </p>
      </div>
    </div>
  )
}
