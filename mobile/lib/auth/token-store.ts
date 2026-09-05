import * as SecureStore from "expo-secure-store"

// Hardware-backed Keychain (iOS) / Keystore (Android API 23+) — the RN equivalent of the
// web client's httpOnly cookies, per docs/adr/mobile-offline.md "Authentication". React
// Native cannot use httpOnly cookies at all (ADR-001, foundation.md), so this is not a
// style choice, it's the only secure option. Same 15-min access / 30-day refresh JWT
// contract as web — only the storage mechanism differs.
const ACCESS_TOKEN_KEY = "kayaktrek.access_token"
const REFRESH_TOKEN_KEY = "kayaktrek.refresh_token"

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken),
  ])
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ])
}
