import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * True while the viewport is narrower than `breakpoint`.
 *
 * For the cases CSS cannot reach: a branch that decides whether to *render*
 * something rather than how to style it. Leaflet layers are the standing example
 * — they mount into Leaflet's own panes, not into our tree, so there is nothing
 * for a `md:`/`lg:` prefix to attach to. Prefer a breakpoint class everywhere
 * else; this re-renders on resize and a CSS rule does not.
 *
 * The viewport is an external store, so it is read through
 * `useSyncExternalStore` rather than mirrored into state from an effect. The
 * server snapshot is `false` — there is no viewport to measure during SSR, so
 * hydration matches the markup and React re-renders with the real width right
 * after.
 */
export function useIsBelowBreakpoint(breakpoint: number) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
      mql.addEventListener("change", onStoreChange)
      return () => mql.removeEventListener("change", onStoreChange)
    },
    [breakpoint],
  )

  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < breakpoint,
    () => false,
  )
}

export function useIsMobile() {
  return useIsBelowBreakpoint(MOBILE_BREAKPOINT)
}
