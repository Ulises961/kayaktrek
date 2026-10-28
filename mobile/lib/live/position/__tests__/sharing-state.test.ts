import {
  getSharingRecord,
  resetSharingStateForTests,
  setSharingRecord,
  subscribeSharing,
  updateSharingRecord,
} from "../sharing-state"
import type { SharingRecord } from "../types"

// An in-memory stand-in for the one file the module reads and writes.
const mockDisk = new Map<string, string>()

jest.mock("expo-file-system", () => ({
  Paths: { document: "doc" },
  File: class {
    private readonly name: string
    constructor(_directory: string, name: string) {
      this.name = name
    }
    get exists() {
      return mockDisk.has(this.name)
    }
    create() {
      mockDisk.set(this.name, "")
    }
    write(text: string) {
      mockDisk.set(this.name, text)
    }
    textSync() {
      return mockDisk.get(this.name) ?? ""
    }
    delete() {
      mockDisk.delete(this.name)
    }
  },
}))

const RECORD: SharingRecord = {
  target: { kind: "trip", tripId: "trip-1" },
  startedAt: 1_000,
  lastSentAt: null,
  lastFixAt: null,
  lastWakeAt: null,
  lastFailure: null,
  endedReason: null,
}

beforeEach(() => {
  mockDisk.clear()
  resetSharingStateForTests()
})

describe("sharing state", () => {
  it("starts empty", () => {
    expect(getSharingRecord()).toBeNull()
  })

  it("survives a restart: a fresh process reads what the last one wrote", () => {
    setSharingRecord(RECORD)
    resetSharingStateForTests()
    expect(getSharingRecord()).toEqual(RECORD)
  })

  it("merges an update into the record and keeps it on disk", () => {
    setSharingRecord(RECORD)
    updateSharingRecord({ lastSentAt: 5_000 })
    resetSharingStateForTests()
    expect(getSharingRecord()).toEqual({ ...RECORD, lastSentAt: 5_000 })
  })

  it("ignores an update when there is nothing being shared", () => {
    expect(updateSharingRecord({ lastSentAt: 5_000 })).toBeNull()
    expect(getSharingRecord()).toBeNull()
  })

  it("clears the file when the record is cleared", () => {
    setSharingRecord(RECORD)
    setSharingRecord(null)
    resetSharingStateForTests()
    expect(getSharingRecord()).toBeNull()
    expect(mockDisk.size).toBe(0)
  })

  it("treats an unreadable file as no share rather than crashing the task that reads it", () => {
    mockDisk.set("live-sharing.json", "{not json")
    expect(getSharingRecord()).toBeNull()
  })

  it("treats a file with the wrong shape as no share", () => {
    mockDisk.set("live-sharing.json", JSON.stringify({ target: { kind: "bogus" } }))
    expect(getSharingRecord()).toBeNull()
  })

  it("tells subscribers about every change, and stops after unsubscribe", () => {
    const listener = jest.fn()
    const unsubscribe = subscribeSharing(listener)
    setSharingRecord(RECORD)
    updateSharingRecord({ lastSentAt: 9 })
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    setSharingRecord(null)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
