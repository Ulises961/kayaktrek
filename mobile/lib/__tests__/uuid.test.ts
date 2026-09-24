import { uuidv7 } from "../uuid"

// UUIDv7 is the project's primary-key format (backend BaseModel). Things created
// offline carry an id the phone generated, so it has to be one the server accepts.
describe("uuidv7", () => {
  it("is a version 7, RFC 4122 variant UUID", () => {
    const id = uuidv7()

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it("starts with the millisecond timestamp, so ids sort by creation time", () => {
    const at = new Date("2026-09-25T10:00:00Z")

    const id = uuidv7(at)

    const timestampHex = id.replace(/-/g, "").slice(0, 12)
    expect(parseInt(timestampHex, 16)).toBe(at.getTime())
  })

  it("does not repeat", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => uuidv7()))

    expect(ids.size).toBe(1000)
  })
})
