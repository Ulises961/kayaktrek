import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

// The itinerary's switch between view and edit mode lives in the trip's header (M43), which
// the tab navigator draws above the screens and not inside them. The itinerary screen
// publishes what it needs shown; the header reads it. Plain data, not a React element, so a
// republish on every render cannot start a loop.
export type TripHeaderEdit = { editing: boolean; onToggle: () => void }

type TripHeaderEditContextValue = {
  action: TripHeaderEdit | null
  setAction: (action: TripHeaderEdit | null) => void
}

const TripHeaderEditContext = createContext<TripHeaderEditContextValue>({
  action: null,
  setAction: () => undefined,
})

export function TripHeaderEditProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<TripHeaderEdit | null>(null)
  const value = useMemo(() => ({ action, setAction }), [action])
  return <TripHeaderEditContext.Provider value={value}>{children}</TripHeaderEditContext.Provider>
}

export function useTripHeaderEdit(): TripHeaderEditContextValue {
  return useContext(TripHeaderEditContext)
}

// Called by the screen that owns edit mode. Pass `canEdit: false` while the screen is not the
// one in front, or the header would offer Edit over another tab.
export function usePublishTripEdit({
  canEdit,
  editing,
  onToggle,
}: {
  canEdit: boolean
  editing: boolean
  onToggle: () => void
}) {
  const { setAction } = useTripHeaderEdit()
  // The header calls through this, so it always reaches the screen's current handler without
  // the effect below having to re-run whenever the handler's identity changes.
  const onToggleRef = useRef(onToggle)
  useEffect(() => {
    onToggleRef.current = onToggle
  })

  useEffect(() => {
    if (!canEdit) return
    setAction({ editing, onToggle: () => onToggleRef.current() })
    return () => setAction(null)
  }, [canEdit, editing, setAction])
}
