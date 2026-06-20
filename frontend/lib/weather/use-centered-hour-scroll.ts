import { useEffect, useRef } from "react"

// Keeps a horizontal card strip locked to the map's hour slider: when selectedHour
// changes, the card matching that hour is scrolled to the centre. Both the weather
// and sea strips use this with the same selectedHour, so they move as one block
// driven solely by the slider — the strips themselves are not user-scrollable.
export function useCenteredHourScroll(selectedHour: number | undefined) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const active = activeRef.current
    if (!container || !active) return
    const target = active.offsetLeft - (container.clientWidth - active.clientWidth) / 2
    container.scrollTo({ left: Math.max(0, target), behavior: "smooth" })
  }, [selectedHour])

  return { containerRef, activeRef }
}
