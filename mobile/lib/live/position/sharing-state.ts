// The persisted record of what is being shared (see types.ts), read by the UI, the location task and
// the keep-alive watchdog, which may each be running in a different process lifetime. A small file in
// the app's private storage rather than the database: it is one row, it must be readable before the
// database is open, and it holds only times.

import { File, Paths } from "expo-file-system"

import { SharingRecordSchema, type SharingRecord } from "./types"

const FILE_NAME = "live-sharing.json"

let cache: SharingRecord | null | undefined
const listeners = new Set<() => void>()

function file(): File {
  return new File(Paths.document, FILE_NAME)
}

function readFromDisk(): SharingRecord | null {
  try {
    const source = file()
    if (!source.exists) return null
    const parsed = SharingRecordSchema.safeParse(JSON.parse(source.textSync()))
    return parsed.success ? parsed.data : null
  } catch {
    // A file cut short by the process dying mid-write is no share, not a crash in the task reading it.
    return null
  }
}

function writeToDisk(record: SharingRecord | null): void {
  try {
    const target = file()
    if (record === null) {
      if (target.exists) target.delete()
      return
    }
    if (!target.exists) target.create()
    target.write(JSON.stringify(record))
  } catch {
    // The in-memory copy still serves this process; a write that fails must not take the task down.
  }
}

export function getSharingRecord(): SharingRecord | null {
  if (cache === undefined) cache = readFromDisk()
  return cache
}

export function setSharingRecord(record: SharingRecord | null): void {
  cache = record
  writeToDisk(record)
  listeners.forEach((listener) => listener())
}

export function updateSharingRecord(patch: Partial<SharingRecord>): SharingRecord | null {
  const current = getSharingRecord()
  if (current === null) return null
  const next = { ...current, ...patch }
  setSharingRecord(next)
  return next
}

export function subscribeSharing(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Forgets the in-memory copy so the next read goes back to the file, as a restarted process would.
export function resetSharingStateForTests(): void {
  cache = undefined
  listeners.clear()
}
