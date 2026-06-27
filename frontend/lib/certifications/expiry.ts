// A cert is expired when its valid_until date is strictly before today (local).
// Pure comparison — no storage, no backend involvement (plans/M7a.md §3).
export function isCertExpired(validUntil?: string | null): boolean {
  if (!validUntil) return false
  const today = new Date().toISOString().slice(0, 10)
  return validUntil < today
}

// True while a cached elevated token is still within its validity window. Kept
// out of the component body so the impure clock read isn't analysed as a render call.
export function isElevatedValid(expiresAt: number): boolean {
  return expiresAt > Date.now()
}
