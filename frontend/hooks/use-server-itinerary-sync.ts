"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { Itinerary } from "@/lib/dtos/itinerary"
import { itinerarySignature } from "@/lib/itinerary/server-sync"

type Options = {
  itinerary: Itinerary
  // The user is part-way through something the new data would overwrite: an unapplied
  // boundary draft, a point still being named, days queued for deletion.
  isEditing: boolean
  // One of the user's own saves is in flight. Not a reason to alert anyone — the data
  // that arrives after it is theirs — so it only defers the sync.
  isSaving: boolean
  // `routeSignature` of what the builder holds right now, its own saves included. A refresh
  // that describes exactly this is the user's own change coming back, not someone else's.
  localSignature: string
  // Replaces the builder's local state with the given itinerary's.
  apply: (itinerary: Itinerary) => void
  // Drops the unsaved local edit when the user chooses the server's version.
  discardLocalEdit: () => void
}

// Keeps the builder showing the server's itinerary after `router.refresh()` (M36).
//
// The builder copies its itinerary into a reducer once, so fresh props alone change
// nothing on screen. This notices that the props now describe something other than what
// was last applied and either applies it, silently, or — when the user is mid-edit —
// leaves their work alone and reports that the route moved underneath them. Nothing is
// merged: the user either keeps going (their save then goes through the normal
// route_version check) or takes the server's version.
export function useServerItinerarySync({
  itinerary,
  isEditing,
  isSaving,
  localSignature,
  apply,
  discardLocalEdit,
}: Options) {
  const signature = useMemo(() => itinerarySignature(itinerary), [itinerary])
  // The signature of the server data the builder last took in. The first render's props are
  // what it was seeded with.
  const [appliedSignature, setAppliedSignature] = useState(signature)

  // The server now says what the builder already shows: the user's own saves, echoed back.
  const matchesLocal = signature === localSignature
  const behind = signature !== appliedSignature && !matchesLocal
  // Derived, so a change that reverts before the user acts on it stops being reported
  // without anything having to notice.
  const serverMovedWhileEditing = behind && isEditing && !isSaving

  // Taking the echo in as applied keeps the next comparison against the server's latest
  // state, not against what it said before the user's edit.
  useEffect(() => {
    if (!matchesLocal || signature === appliedSignature) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppliedSignature(signature)
  }, [matchesLocal, signature, appliedSignature])

  useEffect(() => {
    if (!behind || isSaving || isEditing) return
    apply(itinerary)
    // Marks the external data as applied; it is not derived from other state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppliedSignature(signature)
  }, [behind, isSaving, isEditing, apply, itinerary, signature])

  const takeServerVersion = useCallback(() => {
    discardLocalEdit()
    apply(itinerary)
    setAppliedSignature(signature)
  }, [apply, discardLocalEdit, itinerary, signature])

  return { serverMovedWhileEditing, takeServerVersion }
}
