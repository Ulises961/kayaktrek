import { fetch } from "expo/fetch"

import { createSseParser, type SseEvent } from "./sse-parser"

// Reads a Server-Sent Events response until the server closes it, the signal aborts, or the
// transport fails. `expo/fetch` rather than the global `fetch` because only it exposes the
// response body as a stream; the global one buffers a whole response, which never ends here.
//
// Resolves on a clean close and throws on anything else, including a non-200: the caller
// treats both as "reconnect", after re-minting a ticket.
export async function readEventStream(
  url: string,
  signal: AbortSignal,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const response = await fetch(url, { signal, headers: { Accept: "text/event-stream" } })
  if (!response.ok || !response.body) {
    throw new Error(`Event stream refused: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      for (const event of parser.push(decoder.decode(value, { stream: true }))) onEvent(event)
    }
  } finally {
    reader.releaseLock()
  }
}
