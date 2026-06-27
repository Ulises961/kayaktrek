"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { CertificationsSchema } from "@/lib/dtos/certification"
import type { Certification, CertificationFields } from "@/lib/dtos/certification"

const CERTS_PATH = "/api/user/me/certifications"

export type CertActionResult = { success: true } | { success: false; error: string }
export type CertListResult =
  | { success: true; certifications: Certification[] }
  | { success: false; error: string }

// Add/update/delete are gated by an elevated token (re-auth) on the backend —
// the caller obtains one via reAuth() and passes it through the 5-minute window.
const elevated = (token: string) => ({ "X-Elevated-Token": token })

function elevatedError(msg: string, fallback: string): CertActionResult {
  if (msg.includes("403"))
    return { success: false, error: "Session expired. Please re-authenticate." }
  if (msg.includes("422"))
    return { success: false, error: "Please check the certification details." }
  return { success: false, error: fallback }
}

export async function listCertifications(): Promise<CertListResult> {
  try {
    const raw = await apiGet<unknown>(CERTS_PATH)
    return { success: true, certifications: CertificationsSchema.parse(raw) }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to load certifications." }
  }
}

export async function addCertification(
  elevatedToken: string,
  fields: CertificationFields,
): Promise<CertActionResult> {
  try {
    await apiPost(CERTS_PATH, certPayload(fields), elevated(elevatedToken))
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return elevatedError(e instanceof Error ? e.message : "", "Failed to add certification.")
  }
}

export async function updateCertification(
  elevatedToken: string,
  certId: string,
  fields: CertificationFields,
): Promise<CertActionResult> {
  try {
    await apiPatch(`${CERTS_PATH}/${certId}`, certPayload(fields), elevated(elevatedToken))
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return elevatedError(e instanceof Error ? e.message : "", "Failed to update certification.")
  }
}

export async function deleteCertification(
  elevatedToken: string,
  certId: string,
): Promise<CertActionResult> {
  try {
    await apiDelete(`${CERTS_PATH}/${certId}`, elevated(elevatedToken))
    revalidatePath("/profile")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return elevatedError(e instanceof Error ? e.message : "", "Failed to delete certification.")
  }
}

// Coerce empty optional strings to null so the backend stores absence, not "".
function certPayload(fields: CertificationFields) {
  return {
    organization: fields.organization,
    award: fields.award,
    membershipNumber: fields.membershipNumber || null,
    awardedAt: fields.awardedAt || null,
    validUntil: fields.validUntil || null,
  }
}
