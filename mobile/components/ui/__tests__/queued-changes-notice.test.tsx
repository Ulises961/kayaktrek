import { fireEvent, render } from "@testing-library/react-native"
import type { ReactNode } from "react"

import { MUTATION_STATUS, type QueuedMutation } from "../../../lib/db/mutation-queue"
import { QueuedChangesContext, type QueuedChanges } from "../../../lib/network/queued-changes"
import { QueuedChangesNotice } from "../queued-changes-notice"

jest.mock("../../../lib/db/database", () => ({ database: {} }))

function change(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    mutationId: "m-1",
    entityType: "packing_item",
    operation: "update",
    entityId: "e-1",
    payload: { checked: true },
    deviceTimestamp: "2026-09-25T10:00:00.000Z",
    status: MUTATION_STATUS.PENDING,
    reason: null,
    ...overrides,
  }
}

async function renderWith(value: Partial<QueuedChanges>) {
  const full: QueuedChanges = {
    pending: [],
    rejected: [],
    dismiss: jest.fn(async () => undefined),
    discardAll: jest.fn(async () => undefined),
    ...value,
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueuedChangesContext.Provider value={full}>{children}</QueuedChangesContext.Provider>
  )
  const rendered = await render(<QueuedChangesNotice />, { wrapper })
  return { ...rendered, value: full }
}

describe("QueuedChangesNotice", () => {
  it("says nothing when nothing is queued", async () => {
    const { toJSON } = await renderWith({})

    expect(toJSON()).toBeNull()
  })

  it("says how many changes are waiting to be sent", async () => {
    const { getByText } = await renderWith({
      pending: [change(), change({ mutationId: "m-2" })],
    })

    expect(getByText("2 changes waiting to send.")).toBeTruthy()
  })

  it("says it in the singular for one", async () => {
    const { getByText } = await renderWith({ pending: [change()] })

    expect(getByText("1 change waiting to send.")).toBeTruthy()
  })

  // A change the server refused must never just vanish: the paddler sees what it
  // was and why, and dismisses it themselves.
  it("shows a rejected change, what it was, and why", async () => {
    const rejected = change({
      status: MUTATION_STATUS.REJECTED,
      reason: "That packing item no longer exists.",
    })

    const { getByText } = await renderWith({ rejected: [rejected] })

    expect(getByText("1 change couldn't be applied.")).toBeTruthy()
    expect(getByText("Packed or unpacked an item")).toBeTruthy()
    expect(getByText("That packing item no longer exists.")).toBeTruthy()
  })

  it("dismisses a rejected change once read", async () => {
    const rejected = change({ status: MUTATION_STATUS.REJECTED, reason: "No." })
    const { getByLabelText, value } = await renderWith({ rejected: [rejected] })

    await fireEvent.press(getByLabelText("Dismiss Packed or unpacked an item"))

    expect(value.dismiss).toHaveBeenCalledWith("m-1")
  })

  it("names a trip action by what it did", async () => {
    const rejected = change({
      entityType: "trip",
      payload: { action: "pause" },
      status: MUTATION_STATUS.REJECTED,
      reason: "Cannot pause a trip in state 'past'",
    })

    const { getByText } = await renderWith({ rejected: [rejected] })

    expect(getByText("Paused the trip")).toBeTruthy()
  })
})
