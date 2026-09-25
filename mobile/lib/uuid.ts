// UUIDv7 (RFC 9562): a 48-bit millisecond timestamp, then random bits. The project's
// primary-key format — anything created offline carries an id generated here, so later
// queued changes can refer to it before the server has seen it (plans/M9d.md).
//
// These ids need to be unique, not secret: the server authorises every change by the
// signed-in account, never by knowing an id. So Math.random stands in when the runtime
// has no crypto.getRandomValues, rather than adding a native module for it.
function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count)
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => void } })
    .crypto
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < count; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}

export function uuidv7(at: Date = new Date()): string {
  const bytes = randomBytes(16)
  let timestamp = at.getTime()
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256
    timestamp = Math.floor(timestamp / 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70 // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
