export type SseEvent = { event: string; data: string }

// An incremental Server-Sent Events parser. React Native has no EventSource, so the stream
// is read as raw bytes and framed here. Chunks arrive split anywhere — mid-line, mid-event —
// so the parser keeps the unterminated tail between `push` calls.
//
// Handles only what this backend sends: `event:` and `data:` fields and `:` comment lines
// (the heartbeat). `retry:` is ignored because reconnect timing belongs to the caller: a
// ticket has to be re-minted before the stream can reconnect. Events without a name are
// `message`.
export function createSseParser() {
  let pending = ""
  let eventName = ""
  let dataLines: string[] = []

  function dispatch(events: SseEvent[]) {
    if (dataLines.length > 0) {
      events.push({ event: eventName || "message", data: dataLines.join("\n") })
    }
    eventName = ""
    dataLines = []
  }

  return {
    push(chunk: string): SseEvent[] {
      const events: SseEvent[] = []
      pending += chunk
      const lines = pending.split(/\r\n|\n|\r/)
      pending = lines.pop() ?? ""

      for (const line of lines) {
        if (line === "") {
          dispatch(events)
        } else if (!line.startsWith(":")) {
          const separator = line.indexOf(":")
          const field = separator === -1 ? line : line.slice(0, separator)
          let value = separator === -1 ? "" : line.slice(separator + 1)
          if (value.startsWith(" ")) value = value.slice(1)
          if (field === "event") eventName = value
          else if (field === "data") dataLines.push(value)
        }
      }
      return events
    },
  }
}
