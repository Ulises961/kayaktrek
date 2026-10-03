import { fetch } from "expo/fetch"

import { readEventStream } from "../event-stream"
import type { SseEvent } from "../sse-parser"

jest.mock("expo/fetch", () => ({ fetch: jest.fn() }))

const mockedFetch = fetch as jest.Mock
const encoder = new TextEncoder()

function streamOf(chunks: string[]) {
  let index = 0
  return {
    getReader: () => ({
      read: async () =>
        index < chunks.length
          ? { done: false, value: encoder.encode(chunks[index++]) }
          : { done: true, value: undefined },
      releaseLock: jest.fn(),
    }),
  }
}

function respond(chunks: string[], init: { ok?: boolean; status?: number } = {}) {
  mockedFetch.mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body: streamOf(chunks),
  })
}

describe("readEventStream", () => {
  beforeEach(() => jest.clearAllMocks())

  it("requests an event stream with the abort signal", async () => {
    respond([])
    const controller = new AbortController()

    await readEventStream("http://sse/changes", controller.signal, jest.fn())

    expect(mockedFetch).toHaveBeenCalledWith("http://sse/changes", {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    })
  })

  it("delivers events in order, reassembling ones split across chunks", async () => {
    respond(["event: hello\ndata: {\"rev\"", ": 3}\n\nevent: change\ndata: {}\n\n"])
    const events: SseEvent[] = []

    await readEventStream("http://sse/changes", new AbortController().signal, (event) =>
      events.push(event),
    )

    expect(events).toEqual([
      { event: "hello", data: '{"rev": 3}' },
      { event: "change", data: "{}" },
    ])
  })

  it("resolves when the server closes the stream", async () => {
    respond([": hb\n\n"])
    await expect(
      readEventStream("http://sse/changes", new AbortController().signal, jest.fn()),
    ).resolves.toBeUndefined()
  })

  it("throws on a non-200 response, so the caller backs off and re-mints", async () => {
    respond([], { ok: false, status: 404 })
    await expect(
      readEventStream("http://sse/changes", new AbortController().signal, jest.fn()),
    ).rejects.toThrow("404")
  })

  it("throws when the response has no body", async () => {
    mockedFetch.mockResolvedValue({ ok: true, status: 200, body: null })
    await expect(
      readEventStream("http://sse/changes", new AbortController().signal, jest.fn()),
    ).rejects.toThrow()
  })

  it("propagates a transport failure", async () => {
    mockedFetch.mockRejectedValue(new Error("network down"))
    await expect(
      readEventStream("http://sse/changes", new AbortController().signal, jest.fn()),
    ).rejects.toThrow("network down")
  })
})
