import "@testing-library/jest-dom/vitest"
import { configure } from "@testing-library/react"

// RTL's waitFor/findBy* default to a 1000ms timeout, independent of vitest's own
// testTimeout — under full-suite CPU contention (all workers running at once)
// that's tight enough to flake on an otherwise-correct assertion. Same "generous
// on purpose" rationale as testTimeout/hookTimeout: a real hang still fails, just
// later.
//
// This does NOT cover the other flake this suite has had, so don't reach for a
// bigger number when one appears. A mutation's error message paints BEFORE the
// `startTransition` that owns the pending flag exits, so there is a real window
// where the error is on screen and the control is still disabled and still
// labelled "Saving…"/"Uploading…"/"Sending…". A test that waits for the message
// and then synchronously asserts on the control lands inside that window under
// load — and no timeout closes it, because both states are settled, just not at
// the same instant. Wait for the settle signal, not the error: put both
// expectations in ONE waitFor, or use findBy* for the control. Reproduced and
// fixed across five files (2026-08-08); `forks` vs `vmThreads` makes no
// difference, which is what ruled out pool isolation as the cause.
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

// jsdom does not implement matchMedia. Anything that branches on a breakpoint in
// JS rather than in CSS calls it — `useIsMobile` (the map's chart furniture and
// the sidebar), the landing hero/map, the chart scale bar.
//
// `matches: false` is the deliberate default: jsdom's window is 1024px wide, so
// "does not match a mobile query" is the answer consistent with the layout every
// other assertion in the suite is written against. A test that wants the narrow
// branch should override this for itself rather than change the default.
//
// Note this only reaches components that read a media query in JS. Layout that
// lives in CSS is untestable here at any width — jsdom has no layout engine, so
// breakpoint behaviour is asserted in Playwright (`e2e/tests/19-responsive.spec.ts`).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
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
