import {
  LOG_SORT,
  LogPageSchema,
  LogSchema,
  type Log,
  type LogFields,
  type LogPage,
  type LogSort,
} from "@shared/dtos/log"
import { StatsSchema, type Stats } from "@shared/dtos/public-profile"

import { apiDelete, apiGet, apiPatch, apiPost } from "../api/client"

// Page 1 only, matching M9b's "validate the round trip first" scope rather than
// building pagination/filter UI up front (M9i, plans/M9i.md WP1).
export async function getLogs(sort: LogSort = LOG_SORT.NEWEST): Promise<LogPage> {
  const raw = await apiGet<unknown>(`/api/log/all?page=1&sort=${sort}`)
  return LogPageSchema.parse(raw)
}

export async function getEndorsedLogs(sort: LogSort = LOG_SORT.NEWEST): Promise<LogPage> {
  const raw = await apiGet<unknown>(`/api/log/endorsed?page=1&sort=${sort}`)
  return LogPageSchema.parse(raw)
}

// Same aggregate shape as the public profile's stats (StatsSchema) — reused as-is.
export async function getLogStats(): Promise<Stats> {
  const raw = await apiGet<unknown>("/api/log/stats")
  return StatsSchema.parse(raw)
}

export async function getLog(id: string): Promise<Log> {
  const raw = await apiGet<unknown>(`/api/log/${id}`)
  return LogSchema.parse(raw)
}

export async function createLog(fields: LogFields): Promise<Log> {
  const raw = await apiPost<unknown>("/api/log/create", fields)
  return LogSchema.parse(raw)
}

export async function updateLog(id: string, fields: LogFields): Promise<Log> {
  const raw = await apiPatch<unknown>(`/api/log/${id}`, fields)
  return LogSchema.parse(raw)
}

export async function deleteLog(id: string): Promise<void> {
  await apiDelete(`/api/log/${id}`)
}

// Same-trip mutual attestation only (M7a) — the backend 403s when the caller shares
// no trip with the log's author, 422 when the log isn't trip-linked at all. Both
// endpoints return {message}, not the log itself — callers refetch to see the new
// endorsementCount/endorsers.
export async function endorseLog(id: string): Promise<void> {
  await apiPost(`/api/log/${id}/endorse`, {})
}

export async function unendorseLog(id: string): Promise<void> {
  await apiDelete(`/api/log/${id}/endorse`)
}
