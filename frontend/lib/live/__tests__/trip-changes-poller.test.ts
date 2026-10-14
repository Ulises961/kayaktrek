import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createTripChangesPoller, type TripChangesStatus } from "../trip-changes-poller"
import type { TripChange } from "../../dtos/trip-change"

const INTERVAL_MS = 7000
// `random: () => 0.5` makes every jitter exactly neutral, so timings below are exact.
const NEUTRAL = () => 0.5
const FIRST_POLL_MS = 500
const BASE_URL = "http://sse/api/v1/live/trip/t1/changes?ticket=tk1"

const POINT_CHANGE: TripChange = { t: "point", id: "p1", op: "update" }

type FakeReply = {
  status?: number
  body?: unknown
  headers?: Record<string, string>
  throws?: boolean
}

function reply(
  page: Partial<{ rev: number; changes: TripChange[]; truncated: boolean }> = {},
): FakeReply {
  return { body: { rev: 5, changes: [], truncated: false, ...page } }
}

function fakeResponse({ status = 200, body, headers = {} }: FakeReply) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? headers[name.toLowerCase()] ?? null },
    json: async () => body,
  }
}

function setup(
  replies: FakeReply[],
  options: {
    since?: number | null
    mintUrl?: () => Promise<string | null>
    startActive?: boolean
  } = {},
) {
  const queue = [...replies]
  const fetchImpl = vi.fn(async (_url: string) => {
    const next = queue.shift() ?? reply()
    if (next.throws) throw new Error("network down")
    return fakeResponse(next)
  })
  const mintUrl = vi.fn(options.mintUrl ?? (async () => BASE_URL))
  const onChange = vi.fn<(changes: TripChange[]) => void>()
  const statuses: TripChangesStatus[] = []
  const poller = createTripChangesPoller({
    mintUrl,
    onChange,
    onStatus: (status) => statuses.push(status),
    since: options.since === undefined ? 5 : options.since,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    random: NEUTRAL,
    intervalMs: INTERVAL_MS,
    startActive: options.startActive,
  })
  const polledUrls = () => fetchImpl.mock.calls.map((call) => call[0])
  return { poller, fetchImpl, mintUrl, onChange, statuses, polledUrls }
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createTripChangesPoller", () => {
  describe("the first poll", () => {
    it("goes out within a second, from the revision the page was rendered at", async () => {
      const { poller, polledUrls } = setup([reply({ rev: 5 })])
      poller.start()

      await advance(FIRST_POLL_MS - 1)
      expect(polledUrls()).toEqual([])
      await advance(1)
      expect(polledUrls()).toEqual([`${BASE_URL}&since=5`])
      poller.stop()
    })

    it("with no starting revision, only establishes a baseline and reports nothing", async () => {
      const { poller, onChange, polledUrls } = setup([reply({ rev: 9 }), reply({ rev: 9 })], {
        since: null,
      })
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(polledUrls()).toEqual([BASE_URL])
      expect(onChange).not.toHaveBeenCalled()

      await advance(INTERVAL_MS)
      expect(polledUrls()[1]).toBe(`${BASE_URL}&since=9`)
      poller.stop()
    })

    it("reports live once an answer arrives", async () => {
      const { poller, statuses } = setup([reply()])
      poller.start()
      expect(statuses).toEqual(["connecting"])

      await advance(FIRST_POLL_MS)

      expect(statuses).toEqual(["connecting", "live"])
      poller.stop()
    })
  })

  describe("what a poll reports", () => {
    it("hands over the changes and moves its cursor to the new revision", async () => {
      const { poller, onChange, polledUrls } = setup([
        reply({ rev: 7, changes: [POINT_CHANGE] }),
        reply({ rev: 7 }),
      ])
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([POINT_CHANGE])

      await advance(INTERVAL_MS)
      expect(polledUrls()[1]).toBe(`${BASE_URL}&since=7`)
      expect(onChange).toHaveBeenCalledTimes(1)
      poller.stop()
    })

    it("says nothing when nothing changed", async () => {
      const { poller, onChange } = setup([reply({ rev: 5 })])
      poller.start()

      await advance(FIRST_POLL_MS)

      expect(onChange).not.toHaveBeenCalled()
      poller.stop()
    })

    it("treats a truncated answer as 'something changed, I cannot say what'", async () => {
      const { poller, onChange, polledUrls } = setup([
        reply({ rev: 40, changes: [], truncated: true }),
        reply({ rev: 40 }),
      ])
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(onChange).toHaveBeenCalledWith([])

      await advance(INTERVAL_MS)
      expect(polledUrls()[1]).toBe(`${BASE_URL}&since=40`)
      poller.stop()
    })

    it("polls again after the interval, not sooner", async () => {
      const { poller, polledUrls } = setup([reply(), reply(), reply()])
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(polledUrls()).toHaveLength(1)
      await advance(INTERVAL_MS - 1)
      expect(polledUrls()).toHaveLength(1)
      await advance(1)
      expect(polledUrls()).toHaveLength(2)
      poller.stop()
    })

    it("spreads polls out with jitter so open pages do not poll in step", async () => {
      const requestedAt: number[] = []
      const start = Date.now()
      const poller = createTripChangesPoller({
        mintUrl: async () => BASE_URL,
        onChange: () => undefined,
        since: 5,
        fetchImpl: (async () => {
          requestedAt.push(Date.now() - start)
          return fakeResponse(reply())
        }) as unknown as typeof fetch,
        // The top of the range: the first poll at a full second, then +20% on the interval.
        random: () => 1,
        intervalMs: INTERVAL_MS,
      })
      poller.start()

      await advance(1000 + INTERVAL_MS * 1.2)

      expect(requestedAt).toEqual([1000, 1000 + INTERVAL_MS * 1.2])
      poller.stop()
    })
  })

  describe("the ticket", () => {
    it("is minted once and reused across polls", async () => {
      const { poller, mintUrl } = setup([reply(), reply(), reply()])
      poller.start()

      await advance(FIRST_POLL_MS + INTERVAL_MS * 2)

      expect(mintUrl).toHaveBeenCalledTimes(1)
      poller.stop()
    })

    it("is replaced before it can expire, so the server never sees an old one", async () => {
      const urls = ["http://sse/c?ticket=a", "http://sse/c?ticket=b"]
      const { poller, mintUrl, polledUrls } = setup([], {
        mintUrl: async () => urls.shift() ?? null,
      })
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(polledUrls()[0]).toContain("ticket=a")
      // A ticket lives 5 minutes; the poller retires its own after 4, at the next poll.
      await advance(4 * 60 * 1000 + INTERVAL_MS)

      expect(mintUrl.mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(polledUrls().at(-1)).toContain("ticket=b")
      poller.stop()
    })

    it("on a 404 for a ticket it has been using, mints a fresh one and asks again straight away", async () => {
      const urls = ["http://sse/c?ticket=first", "http://sse/c?ticket=second"]
      const { poller, polledUrls, onChange, statuses } = setup(
        [reply(), { status: 404 }, reply({ rev: 6, changes: [POINT_CHANGE] })],
        { mintUrl: async () => urls.shift() ?? null },
      )
      poller.start()

      await advance(FIRST_POLL_MS)
      // The second poll reuses `first`, which the server no longer honours.
      await advance(INTERVAL_MS)

      expect(polledUrls().map((url) => url.split("ticket=")[1].split("&")[0])).toEqual([
        "first",
        "first",
        "second",
      ])
      expect(onChange).toHaveBeenCalledWith([POINT_CHANGE])
      expect(statuses.at(-1)).toBe("live")
      poller.stop()
    })

    it("on a 404 for a ticket minted for that very poll, treats the viewer as no longer on the trip", async () => {
      const { poller, onChange, statuses, polledUrls } = setup([{ status: 404 }])
      poller.start()

      await advance(FIRST_POLL_MS)
      await advance(INTERVAL_MS * 3)

      expect(statuses.at(-1)).toBe("ended")
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith([])
      expect(polledUrls()).toHaveLength(1)
    })

    it("when the server will not mint a ticket, the viewer is no longer on the trip", async () => {
      const { poller, onChange, statuses, fetchImpl } = setup([], { mintUrl: async () => null })
      poller.start()

      await advance(FIRST_POLL_MS)
      await advance(INTERVAL_MS * 3)

      expect(statuses.at(-1)).toBe("ended")
      expect(onChange).toHaveBeenCalledWith([])
      expect(fetchImpl).not.toHaveBeenCalled()
    })

    it("when minting fails for another reason, backs off and tries again", async () => {
      let attempts = 0
      const { poller, statuses, polledUrls } = setup([reply()], {
        mintUrl: async () => {
          attempts += 1
          if (attempts === 1) throw new Error("backend down")
          return BASE_URL
        },
      })
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(statuses.at(-1)).toBe("error")
      expect(polledUrls()).toHaveLength(0)

      await advance(5000)
      expect(polledUrls()).toHaveLength(1)
      expect(statuses.at(-1)).toBe("live")
      poller.stop()
    })
  })

  describe("when the server or network is struggling", () => {
    it("waits as long as a 503 asks", async () => {
      const { poller, polledUrls } = setup([
        { status: 503, headers: { "Retry-After": "30" } },
        reply(),
      ])
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(polledUrls()).toHaveLength(1)
      await advance(29_999)
      expect(polledUrls()).toHaveLength(1)
      await advance(1)
      expect(polledUrls()).toHaveLength(2)
      poller.stop()
    })

    it("never retries a 429 sooner than a normal poll", async () => {
      const { poller, polledUrls } = setup([{ status: 429 }, reply()])
      poller.start()

      await advance(FIRST_POLL_MS)
      await advance(INTERVAL_MS - 1)
      expect(polledUrls()).toHaveLength(1)
      await advance(1)
      expect(polledUrls()).toHaveLength(2)
      poller.stop()
    })

    it("backs off exponentially through network failures, up to a ceiling, and recovers", async () => {
      const { poller, polledUrls, statuses } = setup([
        { throws: true },
        { throws: true },
        { throws: true },
        { throws: true },
        { throws: true },
        { throws: true },
        reply(),
      ])
      poller.start()

      await advance(FIRST_POLL_MS)
      expect(polledUrls()).toHaveLength(1)
      await advance(5_000)
      expect(polledUrls()).toHaveLength(2)
      await advance(10_000)
      expect(polledUrls()).toHaveLength(3)
      await advance(20_000)
      expect(polledUrls()).toHaveLength(4)
      await advance(40_000)
      expect(polledUrls()).toHaveLength(5)
      await advance(60_000)
      expect(polledUrls()).toHaveLength(6)
      await advance(60_000)
      expect(polledUrls()).toHaveLength(7)
      expect(statuses.at(-1)).toBe("live")
      poller.stop()
    })

    it("treats an answer it cannot read as a failure, not a change", async () => {
      const { poller, onChange, statuses } = setup([{ body: { unexpected: true } }])
      poller.start()

      await advance(FIRST_POLL_MS)

      expect(onChange).not.toHaveBeenCalled()
      expect(statuses.at(-1)).toBe("error")
      poller.stop()
    })

    it("does not lose its place across a failure", async () => {
      const { poller, polledUrls } = setup([{ throws: true }, reply()])
      poller.start()

      await advance(FIRST_POLL_MS + 5_000)

      expect(polledUrls()).toEqual([`${BASE_URL}&since=5`, `${BASE_URL}&since=5`])
      poller.stop()
    })
  })

  describe("pausing", () => {
    it("polls nothing while inactive", async () => {
      const { poller, polledUrls } = setup([reply()], { startActive: false })
      poller.start()

      await advance(INTERVAL_MS * 5)

      expect(polledUrls()).toEqual([])
      poller.stop()
    })

    it("stops polling when paused and picks up again, straight away, when resumed", async () => {
      const { poller, polledUrls } = setup([reply(), reply(), reply()])
      poller.start()
      await advance(FIRST_POLL_MS)
      expect(polledUrls()).toHaveLength(1)

      poller.setActive(false)
      await advance(INTERVAL_MS * 4)
      expect(polledUrls()).toHaveLength(1)

      poller.setActive(true)
      await advance(0)
      expect(polledUrls()).toHaveLength(2)
      poller.stop()
    })

    it("catches up on what it missed while paused", async () => {
      const { poller, onChange } = setup([reply(), reply({ rev: 9, changes: [POINT_CHANGE] })])
      poller.start()
      await advance(FIRST_POLL_MS)
      poller.setActive(false)
      await advance(60_000)

      poller.setActive(true)
      await advance(0)

      expect(onChange).toHaveBeenCalledWith([POINT_CHANGE])
      poller.stop()
    })
  })

  describe("stopping", () => {
    it("makes no further requests and no further callbacks", async () => {
      const { poller, polledUrls, onChange } = setup([
        reply({ rev: 6, changes: [POINT_CHANGE] }),
        reply(),
      ])
      poller.start()
      await advance(FIRST_POLL_MS)
      poller.stop()
      onChange.mockClear()

      await advance(INTERVAL_MS * 5)

      expect(polledUrls()).toHaveLength(1)
      expect(onChange).not.toHaveBeenCalled()
    })

    it("drops an answer that arrives after stopping", async () => {
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const onChange = vi.fn()
      const poller = createTripChangesPoller({
        mintUrl: async () => BASE_URL,
        onChange,
        since: 5,
        fetchImpl: (async () => {
          await gate
          return fakeResponse(reply({ rev: 6, changes: [POINT_CHANGE] }))
        }) as unknown as typeof fetch,
        random: NEUTRAL,
        intervalMs: INTERVAL_MS,
      })
      poller.start()
      await advance(FIRST_POLL_MS)

      poller.stop()
      release()
      await advance(0)

      expect(onChange).not.toHaveBeenCalled()
    })
  })
})
