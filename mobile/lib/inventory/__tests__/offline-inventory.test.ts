import { enqueueMutation } from "../../db/mutation-queue"
import { requestPush } from "../../db/push-pending"
import { queueContribution, queuePackingAdd, queuePackingRemove, queuePackingToggle } from "../offline-inventory"

jest.mock("../../db/mutation-queue", () => ({
  ...jest.requireActual("../../db/mutation-queue"),
  enqueueMutation: jest.fn(),
}))
jest.mock("../../db/push-pending", () => ({ requestPush: jest.fn() }))

const mockEnqueue = enqueueMutation as jest.Mock
const mockPush = requestPush as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockEnqueue.mockResolvedValue("mutation-1")
})

// M9d WP6: the kit and group checklist changed with no signal, queued for the
// batch endpoint (backend Services/mutation_queue_service.py).
describe("offline inventory changes", () => {
  it("queues packing or unpacking an item", async () => {
    await queuePackingToggle("entry-1", true)

    expect(mockEnqueue).toHaveBeenCalledWith({
      entityType: "packing_item",
      operation: "update",
      entityId: "entry-1",
      payload: { checked: true },
    })
  })

  it("queues adding an item to the kit under an id the phone chooses", async () => {
    const entryId = await queuePackingAdd("trip-1", "item-1")

    expect(entryId).toMatch(/^[0-9a-f-]{36}$/)
    expect(mockEnqueue).toHaveBeenCalledWith({
      entityType: "packing_item",
      operation: "create",
      entityId: entryId,
      payload: { tripId: "trip-1", itemId: "item-1" },
    })
  })

  it("queues removing an item from the kit", async () => {
    await queuePackingRemove("entry-1")

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "packing_item", operation: "delete", entityId: "entry-1" }),
    )
  })

  it("queues bringing an item for the group, named by trip", async () => {
    const mutationId = await queueContribution("trip-1", "req-1", "item-1")

    expect(mutationId).toBe("mutation-1")
    expect(mockEnqueue).toHaveBeenCalledWith({
      entityType: "contribution",
      operation: "create",
      entityId: "req-1",
      payload: { tripId: "trip-1", itemId: "item-1" },
    })
  })

  it("tries to send each change straight away", async () => {
    await queuePackingToggle("entry-1", false)

    expect(mockPush).toHaveBeenCalled()
  })

  it("queues the change before asking for the push, so a push never races an unwritten row", async () => {
    await queuePackingToggle("entry-1", false)

    expect(mockEnqueue.mock.invocationCallOrder[0]).toBeLessThan(mockPush.mock.invocationCallOrder[0])
  })
})
