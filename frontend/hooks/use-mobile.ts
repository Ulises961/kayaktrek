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
 */
export function useIsBelowBreakpoint(breakpoint: number) {
  const [isBelow, setIsBelow] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => {
      setIsBelow(window.innerWidth < breakpoint)
    }
    mql.addEventListener("change", onChange)
    setIsBelow(window.innerWidth < breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return !!isBelow
}

export function useIsMobile() {
  return useIsBelowBreakpoint(MOBILE_BREAKPOINT)
}
