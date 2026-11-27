import { describe, it, expect, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useServerItinerarySync } from "../use-server-itinerary-sync"
import type { Itinerary } from "@/lib/dtos/itinerary"
import { itinerarySignature } from "@/lib/itinerary/server-sync"

function itineraryWith(pointName: string): Itinerary {
  return {
    id: "itinerary-1",
    days: [
      {
        id: "day-1",
        dayNumber: 1,
        points: [{ id: "point-1", name: pointName, dayId: "day-1" }],
      },
    ],
  } as unknown as Itinerary
}

type HookProps = {
  itinerary: Itinerary
  isEditing: boolean
  isSaving: boolean
  // What the builder holds. Left out, it holds what it was seeded with.
  localSignature?: string
}

function setup(initial: HookProps) {
  const apply = vi.fn()
  const discardLocalEdit = vi.fn()
  const view = renderHook(
    ({ localSignature, ...props }: HookProps) =>
      useServerItinerarySync({
        ...props,
        localSignature: localSignature ?? itinerarySignature(initial.itinerary),
        apply,
        discardLocalEdit,
      }),
    { initialProps: initial },
  )
  return { apply, discardLocalEdit, ...view }
}

describe("useServerItinerarySync", () => {
  it("does nothing on first render: the builder was just seeded from these props", () => {
    const { apply, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: false,
      isSaving: false,
    })

    expect(apply).not.toHaveBeenCalled()
    expect(result.current.serverMovedWhileEditing).toBe(false)
  })

  it("ignores a refresh that returns the same content under a new object", () => {
    // The user's own save re-renders the page with identical data; applying it would
    // replace every point object for nothing.
    const { apply, rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: false,
      isSaving: false,
    })

    rerender({ itinerary: itineraryWith("Cala"), isEditing: false, isSaving: false })

    expect(apply).not.toHaveBeenCalled()
    expect(result.current.serverMovedWhileEditing).toBe(false)
  })

  it("applies someone else's change silently when the user is idle", () => {
    const { apply, rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: false,
      isSaving: false,
    })
    const theirs = itineraryWith("Cala Mondragó")

    rerender({ itinerary: theirs, isEditing: false, isSaving: false })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(theirs)
    expect(result.current.serverMovedWhileEditing).toBe(false)
  })

  it("leaves a mid-edit user's work alone and says the route moved", () => {
    const { apply, discardLocalEdit, rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: true,
      isSaving: false,
    })

    rerender({ itinerary: itineraryWith("Cala Mondragó"), isEditing: true, isSaving: false })

    expect(apply).not.toHaveBeenCalled()
    expect(discardLocalEdit).not.toHaveBeenCalled()
    expect(result.current.serverMovedWhileEditing).toBe(true)
  })

  it("takes the server's version on request, dropping the local edit first", () => {
    const { apply, discardLocalEdit, rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: true,
      isSaving: false,
    })
    const theirs = itineraryWith("Cala Mondragó")
    rerender({ itinerary: theirs, isEditing: true, isSaving: false })

    act(() => result.current.takeServerVersion())

    expect(discardLocalEdit).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(theirs)
    expect(result.current.serverMovedWhileEditing).toBe(false)
  })

  it("applies a pending change by itself once the edit ends", () => {
    const { apply, rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: true,
      isSaving: false,
    })
    const theirs = itineraryWith("Cala Mondragó")
    rerender({ itinerary: theirs, isEditing: true, isSaving: false })
    expect(result.current.serverMovedWhileEditing).toBe(true)

    rerender({ itinerary: theirs, isEditing: false, isSaving: false })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(theirs)
    expect(result.current.serverMovedWhileEditing).toBe(false)
  })

  it("waits out the user's own save without alerting them", () => {
    const { apply, rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: false,
      isSaving: true,
    })
    const incoming = itineraryWith("Cala Mondragó")

    rerender({ itinerary: incoming, isEditing: false, isSaving: true })
    expect(apply).not.toHaveBeenCalled()
    expect(result.current.serverMovedWhileEditing).toBe(false)

    rerender({ itinerary: incoming, isEditing: false, isSaving: false })
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith(incoming)
  })

  it("stops reporting a change that reverts before the user acts on it", () => {
    const original = itineraryWith("Cala")
    const { apply, rerender, result } = setup({
      itinerary: original,
      isEditing: true,
      isSaving: false,
    })
    rerender({ itinerary: itineraryWith("Cala Mondragó"), isEditing: true, isSaving: false })
    expect(result.current.serverMovedWhileEditing).toBe(true)

    rerender({ itinerary: itineraryWith("Cala"), isEditing: true, isSaving: false })

    expect(result.current.serverMovedWhileEditing).toBe(false)
    expect(apply).not.toHaveBeenCalled()
  })

  it("does not report the user's own saved change as someone else's", () => {
    // The user dropped a point and the save finished; the builder already shows it. The
    // refresh the change log triggers brings the same route back.
    const mine = itineraryWith("Cala Mondragó")
    const { apply, rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: true,
      isSaving: false,
    })

    rerender({
      itinerary: mine,
      isEditing: true,
      isSaving: false,
      localSignature: itinerarySignature(mine),
    })

    expect(result.current.serverMovedWhileEditing).toBe(false)
    expect(apply).not.toHaveBeenCalled()
  })

  it("still reports someone else's change after an echo of the user's own", () => {
    const mine = itineraryWith("Cala Mondragó")
    const { rerender, result } = setup({
      itinerary: itineraryWith("Cala"),
      isEditing: true,
      isSaving: false,
    })
    const localSignature = itinerarySignature(mine)
    rerender({ itinerary: mine, isEditing: true, isSaving: false, localSignature })

    rerender({
      itinerary: itineraryWith("Cala Blava"),
      isEditing: true,
      isSaving: false,
      localSignature,
    })

    expect(result.current.serverMovedWhileEditing).toBe(true)
  })

  it("reports a change that returns the server to what it showed before the user's edit", () => {
    // The server was "Cala", the user saved "Cala Mondragó", and someone else then put it
    // back to "Cala": that differs from what the builder holds, so the user is told.
    const original = itineraryWith("Cala")
    const mine = itineraryWith("Cala Mondragó")
    const localSignature = itinerarySignature(mine)
    const { rerender, result } = setup({ itinerary: original, isEditing: true, isSaving: false })
    rerender({ itinerary: mine, isEditing: true, isSaving: false, localSignature })

    rerender({ itinerary: itineraryWith("Cala"), isEditing: true, isSaving: false, localSignature })

    expect(result.current.serverMovedWhileEditing).toBe(true)
  })
})
