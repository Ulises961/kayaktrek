"use client"

import { useEffect } from "react"
import { useMap } from "react-leaflet"

const COLLAPSIBLE_CLASS = "credits-collapsible"
const OPEN_CLASS = "credits-open"

/**
 * Turns Leaflet's credit line into a badge that opens on tap.
 *
 * At 320 the attribution wraps to a full-width strip — 311×38 over a 288px-tall
 * map, 13% of it, edge to edge — and every tap in that band misses the map, so
 * no point can be dropped there. One landing on the OpenStreetMap link navigates
 * out of the builder and takes an unsaved day draft with it.
 *
 * The collapsing itself is CSS (`globals.css`, below `md`); this supplies the
 * open/closed state and the semantics that make the badge a real control. It
 * styles the element Leaflet owns rather than replacing the control, so the tile
 * licences keep coming from the `attribution` prop on each `TileLayer` and there
 * is one credit line to maintain, not two. Same precedent as `ZoomCorner`
 * reaching for `map.zoomControl`.
 */
export function MapCredits() {
  const map = useMap()

  useEffect(() => {
    const container = map.attributionControl?.getContainer?.()
    if (!container) return

    container.classList.add(COLLAPSIBLE_CLASS)
    container.setAttribute("role", "button")
    container.setAttribute("tabindex", "0")
    container.setAttribute("aria-label", "Map credits")
    container.setAttribute("aria-expanded", "false")

    const setOpen = (open: boolean) => {
      container.classList.toggle(OPEN_CLASS, open)
      container.setAttribute("aria-expanded", String(open))
    }
    const isOpen = () => container.classList.contains(OPEN_CLASS)

    const onClick = (event: MouseEvent) => {
      // A tap on a credit link is the point of the control, not a toggle.
      if ((event.target as HTMLElement | null)?.closest("a")) return
      setOpen(!isOpen())
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false)
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        setOpen(!isOpen())
      }
    }

    // Opened, the credit line is wall-to-wall links, so there is no dependable
    // spot left to tap to shut it again — the middle of it is the OpenStreetMap
    // link. Closing on a tap anywhere else is what makes it dismissable on a
    // phone. Listening on pointerdown rather than click so it settles before the
    // map acts on the same gesture; it does not consume the event, so a tap on
    // open water still drops a point.
    const onPointerDownOutside = (event: PointerEvent) => {
      if (!isOpen()) return
      const target = event.target as Node | null
      if (target && container.contains(target)) return
      setOpen(false)
    }

    container.addEventListener("click", onClick)
    container.addEventListener("keydown", onKeyDown)
    document.addEventListener("pointerdown", onPointerDownOutside, true)
    return () => {
      container.removeEventListener("click", onClick)
      container.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("pointerdown", onPointerDownOutside, true)
      container.classList.remove(COLLAPSIBLE_CLASS, OPEN_CLASS)
      for (const attr of ["role", "tabindex", "aria-label", "aria-expanded"]) {
        container.removeAttribute(attr)
      }
    }
  }, [map])

  return null
}
