import {
  TravelDocumentSchema,
  type TravelDocument,
  type TravelDocumentFields,
} from "@shared/dtos/travel-document"
import {
  ShuttleVehicleSchema,
  type ShuttleVehicle,
  type ShuttleVehicleFields,
} from "@shared/dtos/shuttle-vehicle"

import { apiDelete, apiGet, apiPatch, apiPost } from "../api/client"

// Mobile port of frontend/lib/travel-documents/actions.ts and
// frontend/lib/shuttle/actions.ts (M30 WP2) — same endpoints, throw-on-failure
// convention (see lib/trips/actions.ts's crew mutations). File-attachment
// upload/download is deliberately out of scope: mobile has no document-picker or
// multipart-upload machinery yet (net-new capability, not a logistics-specific gap)
// — `url`/`confirmationNumber` still cover the common "here's my booking" case.

export async function getTravelDocuments(tripId: string): Promise<TravelDocument[]> {
  const raw = await apiGet<unknown[]>(`/api/travel-document/${tripId}/all`)
  return raw.map((d) => TravelDocumentSchema.parse(d))
}

export async function createTravelDocument(
  tripId: string,
  fields: Partial<TravelDocumentFields>,
): Promise<TravelDocument> {
  const raw = await apiPost<unknown>(`/api/travel-document/${tripId}/create`, fields)
  return TravelDocumentSchema.parse(raw)
}

export async function updateTravelDocument(
  documentId: string,
  fields: Partial<TravelDocumentFields>,
): Promise<void> {
  await apiPatch(`/api/travel-document/${documentId}`, fields)
}

export async function deleteTravelDocument(documentId: string): Promise<void> {
  await apiDelete(`/api/travel-document/${documentId}`)
}

export async function getShuttleVehicles(tripId: string): Promise<ShuttleVehicle[]> {
  const raw = await apiGet<unknown[]>(`/api/shuttle/${tripId}/all`)
  return raw.map((v) => ShuttleVehicleSchema.parse(v))
}

export async function createShuttleVehicle(
  tripId: string,
  fields: Partial<ShuttleVehicleFields>,
): Promise<void> {
  await apiPost(`/api/shuttle/${tripId}/create`, fields)
}

export async function updateShuttleVehicle(
  vehicleId: string,
  fields: Partial<ShuttleVehicleFields>,
): Promise<void> {
  await apiPatch(`/api/shuttle/vehicle/${vehicleId}`, fields)
}

export async function deleteShuttleVehicle(vehicleId: string): Promise<void> {
  await apiDelete(`/api/shuttle/vehicle/${vehicleId}`)
}

export async function addShuttlePassenger(vehicleId: string, tripMemberId: string): Promise<void> {
  await apiPost(`/api/shuttle/vehicle/${vehicleId}/passenger`, { tripMemberId })
}

export async function removeShuttlePassenger(vehicleId: string, memberId: string): Promise<void> {
  await apiDelete(`/api/shuttle/vehicle/${vehicleId}/passenger/${memberId}`)
}
