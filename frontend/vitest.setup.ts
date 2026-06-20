import "@testing-library/jest-dom"

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

// jsdom does not implement ResizeObserver. The map's ResizeHandler observes its
// container to call Leaflet's invalidateSize() when the side panels resize it.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
