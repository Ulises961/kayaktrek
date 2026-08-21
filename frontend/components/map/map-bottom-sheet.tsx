"use client"
import { useCallback, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type MapBottomSheetProps = {
  children: React.ReactNode
  /** Root classes — the caller owns its own colours, borders and `md` pane width. */
  className?: string
  testId?: string
}

// How little of the sheet may be left showing. Roughly the handle, the header and
// the tab bar, so a dragged-down sheet still says what it is and can be dragged
// back up.
const MIN_HEIGHT = 96

// Keyboard resize step. The pointer drag is the primary gesture; this exists so
// the handle is operable without one.
const KEY_STEP = 48

/**
 * The builder's bottom sheet below `md`, and a plain side pane from `md`.
 *
 * It opens at 45% of the pane column and can be dragged up to the day strip —
 * the map gives up its height to it and takes it back. The ceiling is computed
 * per gesture as "this sheet plus the map column", so it lands flush under the
 * strip without knowing what the strip's height is.
 *
 * The height is published as a CSS custom property rather than an inline
 * `height`, because an inline style would beat `md:h-auto` and follow the sheet
 * into the side-pane layout, where it means nothing.
 */
export function MapBottomSheet({ children, className, testId }: MapBottomSheetProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startHeight: number; max: number } | null>(null)

  // The map column is this sheet's previous sibling; between them they own all
  // the space below the day strip, so their combined height is the ceiling.
  const availableHeight = useCallback((): { current: number; max: number } | null => {
    const root = rootRef.current
    const map = root?.previousElementSibling
    if (!root || !map) return null
    const current = root.getBoundingClientRect().height
    return { current, max: current + map.getBoundingClientRect().height }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const space = availableHeight()
      if (!space) return
      drag.current = { startY: event.clientY, startHeight: space.current, max: space.max }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [availableHeight],
  )

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    // Up is negative in client coordinates and taller here, hence the subtraction.
    const next = state.startHeight + (state.startY - event.clientY)
    setHeight(Math.max(MIN_HEIGHT, Math.min(state.max, next)))
  }, [])

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.key === "ArrowUp" ? KEY_STEP : event.key === "ArrowDown" ? -KEY_STEP : 0
      if (step === 0) return
      const space = availableHeight()
      if (!space) return
      event.preventDefault()
      setHeight(Math.max(MIN_HEIGHT, Math.min(space.max, space.current + step)))
    },
    [availableHeight],
  )

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      style={
        height === null
          ? undefined
          : ({ "--map-sheet-height": `${height}px` } as React.CSSProperties)
      }
      className={cn(
        "flex w-full shrink-0 flex-col md:h-auto md:max-h-none",
        // Only the dragged state pins a height; until then the sheet is as tall as
        // its content, capped at 45% of the column.
        height === null ? "max-h-[45%]" : "h-[var(--map-sheet-height)] max-h-none",
        className,
      )}
    >
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        data-testid="sheet-resize-handle"
        // touch-none so the gesture is a resize rather than a page scroll.
        className="flex shrink-0 cursor-ns-resize touch-none justify-center py-2 md:hidden"
      >
        <div className="bg-border h-1 w-8 rounded-full" />
      </div>
      {children}
    </div>
  )
}
