import { generateKeypair } from "@/lib/crypto/medical"
import { reAuth, storeKeypair } from "@/lib/profile/actions"
import type { ProfileActionResult } from "@/lib/profile/actions"

/**
 * Give an account that has none an X25519 keypair, derived in the browser.
 *
 * Every step needs the plaintext password and none of it may happen on the server (M22):
 * `generateKeypair` wraps the private half under a key derived from the password, and
 * `reAuth` is what proves account ownership to the server now that the password itself no
 * longer travels with the request. So this can only run where the password was just typed —
 * the sign-in form, or the banner's own re-auth prompt.
 *
 * Callers decide what a failure means. The banner shows it; the login form ignores it,
 * because a missing keypair must never stand between someone and their account.
 */
export async function backfillKeypair(password: string): Promise<ProfileActionResult> {
  const authResult = await reAuth(password)
  if (!authResult.success) return { success: false, error: authResult.error }

  const keypair = await generateKeypair(password)
  return storeKeypair(authResult.elevatedToken, keypair)
}
