"use client"
import { useState } from "react"
import { Layers, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

export type LayersControlProps = {
  windEnabled: boolean
  swellEnabled: boolean
  diamondsEnabled: boolean
  hasDiamonds: boolean
  placesEnabled: boolean
  hasPlaces: boolean
  // Wind/swell/diamonds resolve per selected day; hidden when no day is selected.
  // Places are itinerary-scoped, so their toggle can show on its own.
  showConditions: boolean
  onWindToggle: () => void
  onSwellToggle: () => void
  onDiamondsToggle: () => void
  onPlacesToggle: () => void
}

function Toggle({
  enabled,
  onClick,
  testId,
  "aria-checked": ariaChecked,
  children,
}: {
  enabled: boolean
  onClick: () => void
  testId: string
  "aria-checked": boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      role="switch"
      aria-checked={ariaChecked}
      className="hover:bg-muted/30 flex w-full items-center justify-between px-3 py-2 text-left transition-colors"
    >
      <span className="flex items-center gap-2 text-[11px] font-medium">{children}</span>
      <div
        className={cn(
          "relative h-4 w-7 shrink-0 rounded-full transition-colors",
          enabled ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 block h-3 w-3 rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </div>
    </button>
  )
}

export function LayersControl({
  windEnabled,
  swellEnabled,
  diamondsEnabled,
  hasDiamonds,
  placesEnabled,
  hasPlaces,
  showConditions,
  onWindToggle,
  onSwellToggle,
  onDiamondsToggle,
  onPlacesToggle,
}: LayersControlProps) {
  const [open, setOpen] = useState(false)

  return (
    // Bottom-right at every width. It used to sit top-right and only drop on a
    // phone, but a control that changes corner by breakpoint is a thing the user
    // has to relocate; pinning it here instead frees the top row for the Annotate
    // FAB at every width and needs no branch at all.
    // `bottom-10` clears the Leaflet attribution, a full-width 38px strip at 320.
    //
    // `items-end` is not cosmetic: this wrapper is as wide as its widest child, and
    // that is the 198px panel, not the button. Without it the button sat at the
    // wrapper's left edge — at 320 that put it at x≈109, in the middle of the map
    // and on top of the Annotate pill, rather than at the right margin it asks for.
    //
    // flex-col-reverse puts the panel above the button, so an upward-opening menu
    // stays on the map instead of running off the bottom edge.
    //
    // `pointer-events-none` on the wrapper, restored on the two children: this box
    // is as tall as the closed panel and sits at z-[1001] over the map, and a
    // transparent div still hit-tests, so it was swallowing taps beneath it.
    <div
      className="pointer-events-none absolute right-2 bottom-10 z-[1001] flex flex-col-reverse items-end gap-1"
      data-testid="velocity-controls"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="layers-button"
        className={cn(
          "pointer-events-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold shadow-md ring-1 backdrop-blur-sm transition-all",
          open
            ? "bg-card text-foreground ring-primary/50"
            : "bg-card/85 text-foreground ring-border/40",
        )}
      >
        <Layers className="size-3.5" aria-hidden />
        {/* Icon-only on a phone, like the Annotate disclosure it pairs with across
            the map's top row. `sr-only`, not `hidden`, so the button keeps a name. */}
        <span className="sr-only sm:not-sr-only">Overlays</span>
      </button>

      <div
        data-testid="layers-panel"
        style={{ visibility: open ? "visible" : "hidden" }}
        className={cn(
          "bg-card ring-border/30 w-44 overflow-hidden rounded-md shadow-lg ring-1 transition-all duration-150",
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <div className="border-border/30 border-b px-3 py-1.5">
          <span className="text-muted-foreground text-[9px] font-semibold tracking-widest uppercase">
            Map overlays
          </span>
        </div>

        <div className="divide-border/20 flex flex-col divide-y">
          {showConditions && (
            <Toggle
              enabled={windEnabled}
              onClick={onWindToggle}
              testId="wind-toggle"
              aria-checked={windEnabled}
            >
              <span
                className="inline-block h-1.5 w-4 shrink-0 rounded-full bg-gradient-to-r from-[#0d47a1] via-[#ffd600] to-[#d50000]"
                aria-hidden
              />
              Wind
            </Toggle>
          )}

          {showConditions && (
            <Toggle
              enabled={swellEnabled}
              onClick={onSwellToggle}
              testId="swell-toggle"
              aria-checked={swellEnabled}
            >
              <span
                className="ring-border/40 inline-block h-1.5 w-4 rounded-full bg-white/80 ring-1"
                aria-hidden
              />
              Swell
            </Toggle>
          )}

          {hasPlaces && (
            <Toggle
              enabled={placesEnabled}
              onClick={onPlacesToggle}
              testId="places-toggle"
              aria-checked={placesEnabled}
            >
              <MapPin className="size-3 shrink-0 text-[#0e7490]" aria-hidden />
              Places
            </Toggle>
          )}

          {hasDiamonds && (
            <Toggle
              enabled={diamondsEnabled}
              onClick={onDiamondsToggle}
              testId="diamonds-toggle"
              aria-checked={diamondsEnabled}
            >
              <span
                className="inline-block size-2.5 shrink-0 rotate-45 rounded-[2px] border border-[#f97316] bg-[#f97316]/30"
                aria-hidden
              />
              Tidal diamonds
            </Toggle>
          )}
        </div>

        {showConditions && windEnabled && (
          <div className="border-border/20 border-t px-3 pt-1.5 pb-2" data-testid="wind-legend">
            <p className="text-muted-foreground mb-1 text-[9px] font-semibold tracking-widest uppercase">
              Wind speed
            </p>
            <div
              className="h-2.5 w-full rounded-sm"
              style={{
                background:
                  "linear-gradient(to right, #0d47a1, #0091ea, #00bfa5, #00c853, #aeea00, #ffd600, #ff9100, #ff3d00, #d50000)",
              }}
            />
            <div className="text-muted-foreground mt-0.5 flex justify-between text-[8px]">
              <span>0</span>
              <span>20</span>
              <span>40+ m/s</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
