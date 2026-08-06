import "@testing-library/jest-dom"
import { configure } from "@testing-library/react"

// RTL's waitFor/findBy* default to a 1000ms timeout, independent of vitest's own
// testTimeout above — under full-suite CPU contention (all workers running at
// once) that's tight enough to flake on an otherwise-correct assertion. Same
// "generous on purpose" rationale as testTimeout/hookTimeout: a real hang still
// fails, just later. Found via a reproducible (~1-in-3 full-run) flake in
// certifications-section.test.tsx under this sandbox's 4-core load (M15).
configure({ asyncUtilTimeout: 5000 })

// jsdom does not implement the Pointer Capture API. Components that call these
// during drag gestures (e.g. BoundaryDivider) would otherwise throw uncaught
// TypeErrors when their pointer handlers fire under userEvent.
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false
}

// jsdom does not implement Element.scrollTo. The forecast carousels call it to centre
// the card matching the map's hour slider.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {}
}

// jsdom does not implement Element.scrollIntoView. The point-list-pane calls it
// inside a requestAnimationFrame to scroll the new boundary handle into view.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// jsdom does not implement ResizeObserver. The map's ResizeHandler observes its
// container to call Leaflet's invalidateSize() when the side panels resize it.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
