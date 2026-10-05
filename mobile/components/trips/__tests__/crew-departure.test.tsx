import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { enqueueMutation } from "../../../lib/db/mutation-queue"
import { requestPush } from "../../../lib/db/push-pending"
import { CrewDeparture } from "../crew-departure"

jest.mock("../../../lib/db/mutation-queue", () => ({
  ...jest.requireActual("../../../lib/db/mutation-queue"),
  enqueueMutation: jest.fn(),
}))
jest.mock("../../../lib/db/push-pending", () => ({ requestPush: jest.fn() }))

const mockEnqueue = enqueueMutation as jest.Mock
const mockPush = requestPush as jest.Mock

const ON_THE_WATER = { id: "m1", leftAt: null, leftNote: null, departureUnsent: false }

beforeEach(() => {
  jest.clearAllMocks()
  mockEnqueue.mockResolvedValue("mutation-1")
})

// M9d WP5: the leader records who has left the water, so the float plan and shore
// contact know who is still out there.
describe("CrewDeparture", () => {
  it("records a paddler leaving, with a note, and tries to send it", async () => {
    const { getByTestId } = await render(
      <CrewDeparture tripId="trip-1" member={ON_THE_WATER} name="Marta" canRecord />,
    )

    await fireEvent.press(getByTestId("departure-open-m1"))
    await fireEvent.changeText(getByTestId("departure-note-m1"), "Wrist injury, taken off at Cala Montjoi")
    await fireEvent.press(getByTestId("departure-record-m1"))

    expect(mockEnqueue).toHaveBeenCalledWith({
      entityType: "crew_departure",
      operation: "create",
      entityId: "m1",
      payload: { tripId: "trip-1", note: "Wrist injury, taken off at Cala Montjoi" },
    })
    await waitFor(() => expect(mockPush).toHaveBeenCalled())
  })

  it("shows who left, and says when it hasn't been sent", async () => {
    const left = {
      id: "m1",
      leftAt: "2026-10-02T09:30:00.000Z",
      leftNote: "Evacuated",
      departureUnsent: true,
    }

    const { getByText } = await render(<CrewDeparture tripId="trip-1" member={left} name="Marta" canRecord />)

    expect(getByText(/Left the trip/)).toBeTruthy()
    expect(getByText("Evacuated")).toBeTruthy()
    expect(getByText(/not sent yet/)).toBeTruthy()
  })

  it("undoes a departure recorded by mistake", async () => {
    const left = { id: "m1", leftAt: "2026-10-02T09:30:00.000Z", leftNote: null, departureUnsent: false }
    const { getByTestId } = await render(<CrewDeparture tripId="trip-1" member={left} name="Marta" canRecord />)

    await fireEvent.press(getByTestId("departure-undo-m1"))

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "crew_departure", operation: "delete", entityId: "m1" }),
    )
  })

  it("offers nothing to change when the viewer can't record departures", async () => {
    const { queryByTestId } = await render(
      <CrewDeparture tripId="trip-1" member={ON_THE_WATER} name="Marta" canRecord={false} />,
    )

    expect(queryByTestId("departure-open-m1")).toBeNull()
  })
})
