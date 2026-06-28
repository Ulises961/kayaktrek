import { useEffect, useState } from "react"

// Trailing-edge debounce: returns a wrapped function that delays invoking `fn`
// until `delayMs` has elapsed since the last call. Use for debouncing a callback
// (e.g. persisting a slider value after the user stops dragging). Call `.cancel()`
// to drop a pending invocation — do this on unmount to avoid firing after teardown.
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let handle: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: Args) => {
    if (handle) clearTimeout(handle)
    handle = setTimeout(() => {
      handle = null
      fn(...args)
    }, delayMs)
  }

  debounced.cancel = () => {
    if (handle) clearTimeout(handle)
    handle = null
  }

  return debounced
}

// React hook that returns a debounced copy of `value`, updating only after `value`
// has stopped changing for `delayMs`. Use for debouncing a value that drives an
// effect (e.g. a search term feeding a query).
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(handle)
  }, [value, delayMs])

  return debounced
}
