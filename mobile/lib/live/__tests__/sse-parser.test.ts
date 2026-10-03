import { createSseParser } from "../sse-parser"

describe("createSseParser", () => {
  it("parses a named event with data", () => {
    const parser = createSseParser()
    expect(parser.push('event: hello\ndata: {"rev": 4}\n\n')).toEqual([
      { event: "hello", data: '{"rev": 4}' },
    ])
  })

  it("defaults an unnamed event to message", () => {
    expect(createSseParser().push("data: hi\n\n")).toEqual([{ event: "message", data: "hi" }])
  })

  it("ignores heartbeat comments and retry fields", () => {
    expect(createSseParser().push("retry: 5000\n\n: hb\n\n")).toEqual([])
  })

  it("keeps an event split across chunks until it is terminated", () => {
    const parser = createSseParser()
    expect(parser.push("event: cha")).toEqual([])
    expect(parser.push('nge\ndata: {"rev"')).toEqual([])
    expect(parser.push(": 9}\n")).toEqual([])
    expect(parser.push("\n")).toEqual([{ event: "change", data: '{"rev": 9}' }])
  })

  it("returns several events from one chunk, in order", () => {
    const events = createSseParser().push("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n")
    expect(events.map((entry) => entry.event)).toEqual(["a", "b"])
  })

  it("joins multiple data lines with a newline", () => {
    expect(createSseParser().push("data: one\ndata: two\n\n")).toEqual([
      { event: "message", data: "one\ntwo" },
    ])
  })

  it("accepts CRLF line endings", () => {
    expect(createSseParser().push("event: end\r\ndata: {}\r\n\r\n")).toEqual([
      { event: "end", data: "{}" },
    ])
  })

  it("does not leak one event's name into the next", () => {
    const events = createSseParser().push("event: a\ndata: 1\n\ndata: 2\n\n")
    expect(events).toEqual([
      { event: "a", data: "1" },
      { event: "message", data: "2" },
    ])
  })
})
