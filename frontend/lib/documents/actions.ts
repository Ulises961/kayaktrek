"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { DocumentSchema, type Document, type DocumentFields } from "@/lib/dtos/document"

export type DocumentActionResult = { success: true } | { success: false; error: string }

export async function getDocuments(tripId: string): Promise<Document[]> {
  const raw = await apiGet<unknown[]>(`/api/document/${tripId}/all`)
  return raw.map((d) => DocumentSchema.parse(d))
}

export async function createDocument(tripId: string, fields: Partial<DocumentFields>): Promise<DocumentActionResult> {
  try {
    await apiPost(`/api/document/${tripId}/create`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create document." }
  }
}

export async function updateDocument(tripId: string, documentId: string, fields: Partial<DocumentFields>): Promise<DocumentActionResult> {
  try {
    await apiPatch(`/api/document/${documentId}`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update document." }
  }
}

export async function deleteDocument(tripId: string, documentId: string): Promise<DocumentActionResult> {
  try {
    await apiDelete(`/api/document/${documentId}`)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete document." }
  }
}
