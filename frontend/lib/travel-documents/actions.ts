"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload } from "@/lib/api/client"
import { TravelDocumentSchema, type TravelDocument, type TravelDocumentFields } from "@/lib/dtos/travel-document"

export type TravelDocumentActionResult = { success: true } | { success: false; error: string }
export type TravelDocumentCreateResult = { success: true; document: TravelDocument } | { success: false; error: string }
export type AttachmentUrlResult = { success: true; url: string } | { success: false; error: string }

export async function getTravelDocuments(tripId: string): Promise<TravelDocument[]> {
  const raw = await apiGet<unknown[]>(`/api/travel-document/${tripId}/all`)
  return raw.map((d) => TravelDocumentSchema.parse(d))
}

export async function createTravelDocument(tripId: string, fields: Partial<TravelDocumentFields>): Promise<TravelDocumentCreateResult> {
  try {
    const raw = await apiPost<unknown>(`/api/travel-document/${tripId}/create`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true, document: TravelDocumentSchema.parse(raw) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create document." }
  }
}

export async function updateTravelDocument(tripId: string, documentId: string, fields: Partial<TravelDocumentFields>): Promise<TravelDocumentActionResult> {
  try {
    await apiPatch(`/api/travel-document/${documentId}`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update document." }
  }
}

export async function deleteTravelDocument(tripId: string, documentId: string): Promise<TravelDocumentActionResult> {
  try {
    await apiDelete(`/api/travel-document/${documentId}`)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete document." }
  }
}

export async function uploadTravelDocumentAttachment(tripId: string, documentId: string, formData: FormData): Promise<TravelDocumentActionResult> {
  try {
    await apiUpload(`/api/travel-document/${documentId}/attachment`, formData)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to upload attachment." }
  }
}

export async function deleteTravelDocumentAttachment(tripId: string, documentId: string): Promise<TravelDocumentActionResult> {
  try {
    await apiDelete(`/api/travel-document/${documentId}/attachment`)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete attachment." }
  }
}

export async function getTravelDocumentAttachmentUrl(documentId: string): Promise<AttachmentUrlResult> {
  try {
    const raw = await apiGet<{ url: string }>(`/api/travel-document/${documentId}/attachment`)
    return { success: true, url: raw.url }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to get attachment URL." }
  }
}
