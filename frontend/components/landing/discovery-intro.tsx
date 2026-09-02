"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { cn } from "@/lib/utils"
import {
  Cartouche,
  CartoucheEyebrow,
  CartoucheTitle,
  CartoucheRule,
  CartoucheNote,
} from "./cartouche"

// Must match the `duration-300` Tailwind classes below — Tailwind can't read this
// constant (it scans source text, not runtime values), so the two have to agree by hand.
const EXIT_DURATION_MS = 300

// Floats over the map, corner-anchored. Dismisses on "Explore" or on a click anywhere
// outside the card (the map underneath is the whole rest of the page, so most
// dismissals will land there) — both just trigger the same close, there's nowhere an
// outside click could sensibly navigate to instead. The backdrop below the card exists
// purely to pull the eye to it on first paint, not to gate interaction with the map
// (hence pointer-events-none).
export function DiscoveryIntro() {
  const [state, setState] = useState<"open" | "closing" | "closed">("open")
  const cardRef = useRef<HTMLDivElement>(null)

  function close() {
    setState("closing")
    window.setTimeout(() => setState("closed"), EXIT_DURATION_MS)
  }

  useEffect(() => {
    if (state !== "open") return
    function handlePointerDown(event: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [state])

  if (state === "closed") return null

  const closing = state === "closing"

  return (
    <>
      {/* Lower-left-weighted scrim, same technique as the auth pages' ChartBackdrop but
          tinted with ink, not paper: paper is a pale cream, near-invisible over the
          explore map's light OSM basemap (ChartBackdrop gets away with paper because it
          dims the dark Esri Ocean basemap instead). z-[900]: `.leaflet-container` is
          `position` with `z-index: auto`, so it forms no stacking context and its panes
          (tiles 200 … popups 700) compete directly with this sibling — 900 clears them
          while staying under Leaflet's own controls (1000). */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-0 z-[900] transition-opacity duration-300 ease-out",
          "bg-[radial-gradient(ellipse_at_10%_90%,color-mix(in_oklch,var(--chart-ink)_45%,transparent)_0%,color-mix(in_oklch,var(--chart-ink)_15%,transparent)_35%,transparent_75%)]",
          closing && "opacity-0",
        )}
      />
      <div
        ref={cardRef}
        className={cn(
          "fixed inset-x-4 bottom-4 z-[1001] transition-all duration-300 ease-out sm:inset-x-auto sm:bottom-9 sm:left-9",
          closing && "translate-y-2 opacity-0",
        )}
      >
        <Cartouche className="max-w-[28rem] p-5 sm:p-7">
          <CartoucheEyebrow>Sea-kayak expedition planning</CartoucheEyebrow>
          <CartoucheTitle className="mt-3 text-[1.75rem] sm:text-[2.1rem]">
            Plan the passage.
            <br />
            <em>Paddle it with your crew.</em>
          </CartoucheTitle>
          <CartoucheRule className="mt-4" />
          <CartoucheNote className="mt-4">
            A growing chart of paddled waters — add the one you know best.
          </CartoucheNote>
          <div className="mt-5">
            <Button size="sm" className={ctaButtonClass} onClick={close}>
              Explore
            </Button>
          </div>
        </Cartouche>
      </div>
    </>
  )
}
