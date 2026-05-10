"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { ReservationSchema, type Reservation, type ReservationFields } from "@/lib/dtos/reservation"

export type ReservationActionResult = { success: true } | { success: false; error: string }

export async function getReservations(tripId: string): Promise<Reservation[]> {
  const raw = await apiGet<unknown[]>(`/api/reservation/${tripId}/all`)
  return raw.map((r) => ReservationSchema.parse(r))
}

export async function createReservation(tripId: string, fields: Partial<ReservationFields>): Promise<ReservationActionResult> {
  try {
    await apiPost(`/api/reservation/${tripId}/create`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create reservation." }
  }
}

export async function updateReservation(tripId: string, reservationId: string, fields: Partial<ReservationFields>): Promise<ReservationActionResult> {
  try {
    await apiPatch(`/api/reservation/${reservationId}`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update reservation." }
  }
}

export async function deleteReservation(tripId: string, reservationId: string): Promise<ReservationActionResult> {
  try {
    await apiDelete(`/api/reservation/${reservationId}`)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete reservation." }
  }
}
