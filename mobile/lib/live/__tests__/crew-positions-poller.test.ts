import type { LivePosition } from "@shared/dtos/live-position"

import { createCrewPositionsPoller, type CrewPositionsStatus } from "../crew-positions-poller"

const URL_A = "http://sse.test/api/v1/live/trip/t1/positions?ticket=a"
const URL_B = "http://sse.test/api/v1/live/trip/t1/positions?ticket=b"
const INTERVAL_MS = 10_000

const ada: LivePosition = {
  userId: "u1",
  name: "Ada Paddler",
  lat: 43.1,
  lon: 13.2,
  accuracyM: 8,
  headingDeg: null,
  speedMs: 1.2,
  recordedAt: "2026-11-06T10:00:00+00:00",
}

function answer(positions: LivePosition[], init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ positions }), { status: 200, ...init })
}

function setup(options: { urls?: (string | null)[]; startActive?: boolean } = {}) {
  const urls = options.urls ?? [URL_A, URL_B]
  const mintUrl = jest.fn(async () => {
    const next = urls.length > 1 ? urls.shift() : urls[0]
    if (next === undefined) throw new Error("no more urls")
    return next
  })
  const fetchImpl = jest.fn<Promise<Response>, [string, RequestInit?]>()
  const onPositions = jest.fn<void, [LivePosition[]]>()
  const statuses: CrewPositionsStatus[] = []
  const poller = createCrewPositionsPoller({
    mintUrl,
    onPositions,
    onStatus: (status) => statuses.push(status),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    startActive: options.startActive,
    intervalMs: INTERVAL_MS,
  })
  return { poller, mintUrl, fetchImpl, onPositions, statuses }
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe("createCrewPositionsPoller", () => {
  it("polls at once on start and hands over what the crew's newest positions are", async () => {
    const { poller, mintUrl, fetchImpl, onPositions, statuses } = setup()
    fetchImpl.mockResolvedValue(answer([ada]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)

    expect(mintUrl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(URL_A, expect.objectContaining({ cache: "no-store" }))
    expect(onPositions).toHaveBeenCalledWith([ada])
    expect(statuses).toEqual(["connecting", "live"])
    poller.stop()
  })

  it("polls again every interval on the same ticket", async () => {
    const { poller, mintUrl, fetchImpl, onPositions } = setup()
    fetchImpl.mockImplementation(async () => answer([ada]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(INTERVAL_MS)
    await jest.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(onPositions).toHaveBeenCalledTimes(3)
    expect(mintUrl).toHaveBeenCalledTimes(1)
    poller.stop()
  })

  it("mints a new ticket before the old one can expire", async () => {
    const { poller, mintUrl, fetchImpl } = setup()
    fetchImpl.mockImplementation(async () => answer([]))

    poller.start()
    await jest.advanceTimersByTimeAsync(4 * 60 * 1000 + INTERVAL_MS)

    expect(mintUrl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenLastCalledWith(URL_B, expect.anything())
    poller.stop()
  })

  it("ends, and asks for nothing, when the server says the viewer is not on the trip", async () => {
    const { poller, fetchImpl, onPositions, statuses } = setup({ urls: [null] })

    poller.start()
    await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3)

    expect(statuses).toEqual(["connecting", "ended"])
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(onPositions).not.toHaveBeenCalled()
  })

  it("takes a 404 on an old ticket for an expired ticket: it mints a new one and asks again at once", async () => {
    const { poller, mintUrl, fetchImpl, onPositions } = setup()
    fetchImpl
      .mockImplementationOnce(async () => answer([]))
      .mockImplementationOnce(async () => new Response(null, { status: 404 }))
      .mockImplementation(async () => answer([ada]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(mintUrl).toHaveBeenCalledTimes(2)
    expect(fetchImpl).toHaveBeenLastCalledWith(URL_B, expect.anything())
    expect(onPositions).toHaveBeenLastCalledWith([ada])
    poller.stop()
  })

  it("ends when a ticket minted for this very poll is refused: the trip is no longer under way", async () => {
    const { poller, fetchImpl, statuses } = setup()
    fetchImpl.mockImplementation(async () => new Response(null, { status: 404 }))

    poller.start()
    await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3)

    expect(statuses).toEqual(["connecting", "ended"])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it.each([429, 503])("waits as long as the server asks after a %s, then carries on", async (status) => {
    const { poller, fetchImpl, statuses } = setup()
    fetchImpl
      .mockImplementationOnce(async () => new Response(null, { status, headers: { "Retry-After": "30" } }))
      .mockImplementation(async () => answer([ada]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(29_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1_000)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(statuses).toEqual(["connecting", "error", "live"])
    poller.stop()
  })

  it.each([
    ["the network failing", () => Promise.reject(new TypeError("Network request failed"))],
    ["a server error", async () => new Response(null, { status: 500 })],
    ["an answer that is not the positions shape", async () => new Response("[]", { status: 200 })],
    ["an answer that is not JSON", async () => new Response("oops", { status: 200 })],
  ])("backs off after %s, and recovers on the next good answer", async (_label, failure) => {
    const { poller, fetchImpl, onPositions, statuses } = setup()
    fetchImpl.mockImplementationOnce(failure).mockImplementationOnce(failure).mockImplementation(async () => answer([ada]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(5_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(9_000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(1_000)

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(onPositions).toHaveBeenCalledTimes(1)
    expect(statuses).toEqual(["connecting", "error", "live"])
    poller.stop()
  })

  it("tries again later when minting fails, instead of concluding anything", async () => {
    const { poller, mintUrl, fetchImpl, statuses } = setup()
    mintUrl.mockRejectedValueOnce(new Error("Could not reach the server."))
    fetchImpl.mockImplementation(async () => answer([ada]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    expect(statuses).toEqual(["connecting", "error"])
    await jest.advanceTimersByTimeAsync(5_000)

    expect(statuses).toEqual(["connecting", "error", "live"])
    poller.stop()
  })

  it("does not poll while paused, and polls at once when resumed", async () => {
    const { poller, fetchImpl } = setup()
    fetchImpl.mockImplementation(async () => answer([]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    poller.setActive(false)
    await jest.advanceTimersByTimeAsync(INTERVAL_MS * 5)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    poller.setActive(true)
    await jest.advanceTimersByTimeAsync(0)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    poller.stop()
  })

  it("waits for the app to come to the foreground when it starts in the background", async () => {
    const { poller, fetchImpl } = setup({ startActive: false })
    fetchImpl.mockImplementation(async () => answer([]))

    poller.start()
    await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3)
    expect(fetchImpl).not.toHaveBeenCalled()

    poller.setActive(true)
    await jest.advanceTimersByTimeAsync(0)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    poller.stop()
  })

  it("never has two requests in flight, whatever wakes it meanwhile", async () => {
    const { poller, fetchImpl } = setup()
    let release: (response: Response) => void = () => undefined
    fetchImpl.mockImplementationOnce(() => new Promise<Response>((resolve) => (release = resolve)))
    fetchImpl.mockImplementation(async () => answer([]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    poller.setActive(false)
    poller.setActive(true)
    await jest.advanceTimersByTimeAsync(INTERVAL_MS * 2)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    release(answer([]))
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(INTERVAL_MS)

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    poller.stop()
  })

  it("stops for good: no more polls, and the request in flight is abandoned", async () => {
    const { poller, fetchImpl, onPositions } = setup()
    let signal: AbortSignal | undefined
    let release: (response: Response) => void = () => undefined
    fetchImpl.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>((resolve) => (release = resolve))
    })
    fetchImpl.mockImplementation(async () => answer([ada]))

    poller.start()
    await jest.advanceTimersByTimeAsync(0)
    poller.stop()
    release(answer([ada]))
    await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3)

    expect(signal?.aborted).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(onPositions).not.toHaveBeenCalled()
  })
})
