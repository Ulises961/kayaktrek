"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import {
  ShuttleVehicleSchema,
  type ShuttleVehicle,
  type ShuttleVehicleFields,
} from "@/lib/dtos/shuttle-vehicle"

export type ShuttleActionResult = { success: true } | { success: false; error: string }

export async function getShuttleVehicles(tripId: string): Promise<ShuttleVehicle[]> {
  const raw = await apiGet<unknown[]>(`/api/shuttle/${tripId}/all`)
  return raw.map((v) => ShuttleVehicleSchema.parse(v))
}

export async function createShuttleVehicle(
  tripId: string,
  fields: Partial<ShuttleVehicleFields>,
): Promise<ShuttleActionResult> {
  try {
    await apiPost(`/api/shuttle/${tripId}/create`, fields)
    revalidatePath(`/trips/${tripId}/logistics`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create vehicle." }
  }
}

export async function updateShuttleVehicle(
  tripId: string,
  vehicleId: string,
  fields: Partial<ShuttleVehicleFields>,
): Promise<ShuttleActionResult> {
  try {
    await apiPatch(`/api/shuttle/vehicle/${vehicleId}`, fields)
    revalidatePath(`/trips/${tripId}/logistics`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update vehicle." }
  }
}

export async function deleteShuttleVehicle(
  tripId: string,
  vehicleId: string,
): Promise<ShuttleActionResult> {
  try {
    await apiDelete(`/api/shuttle/vehicle/${vehicleId}`)
    revalidatePath(`/trips/${tripId}/logistics`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete vehicle." }
  }
}

export async function addShuttlePassenger(
  tripId: string,
  vehicleId: string,
  tripMemberId: string,
): Promise<ShuttleActionResult> {
  try {
    await apiPost(`/api/shuttle/vehicle/${vehicleId}/passenger`, { tripMemberId })
    revalidatePath(`/trips/${tripId}/logistics`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to add passenger." }
  }
}

export async function removeShuttlePassenger(
  tripId: string,
  vehicleId: string,
  memberId: string,
): Promise<ShuttleActionResult> {
  try {
    await apiDelete(`/api/shuttle/vehicle/${vehicleId}/passenger/${memberId}`)
    revalidatePath(`/trips/${tripId}/logistics`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove passenger." }
  }
}
