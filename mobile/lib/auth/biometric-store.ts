import * as SecureStore from "expo-secure-store"

// The fingerprint shortcut on the sign-in screen: the address and password are kept in the
// Keystore under a key that only releases them after a biometric check (`requireAuthentication`),
// so reading them back is the fingerprint prompt. The session tokens in token-store.ts are
// separate and carry no such gate.
const CREDENTIALS_KEY = "kayaktrek.biometric_credentials"
// Reading the credentials prompts, so whether they exist is kept in a second, ungated entry — the
// sign-in screen needs that answer to decide whether to show the button, before anyone has touched
// the sensor. It holds no secret.
const ENROLLED_KEY = "kayaktrek.biometric_enrolled"
const ENROLLED = "1"

const PROMPT = "Sign in to Kayaktrek"

export type BiometricCredentials = { mail: string; password: string }

// True when the phone has a biometric enrolled that is strong enough to gate a stored secret.
export function canUseBiometrics(): boolean {
  return SecureStore.canUseBiometricAuthentication()
}

export async function hasBiometricCredentials(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENROLLED_KEY)) === ENROLLED
}

export async function saveBiometricCredentials(credentials: BiometricCredentials): Promise<void> {
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials), {
    requireAuthentication: true,
    authenticationPrompt: PROMPT,
  })
  await SecureStore.setItemAsync(ENROLLED_KEY, ENROLLED)
}

// Asks for the fingerprint and returns what it unlocks. Null for everything that is not "here are
// the credentials": the user cancelled, the sensor failed, or Android invalidated the key because
// a fingerprint was added since (the value is then unreadable for good). The caller shows the
// password form in all of those cases, so none needs telling apart.
export async function readBiometricCredentials(): Promise<BiometricCredentials | null> {
  let stored: string | null
  try {
    stored = await SecureStore.getItemAsync(CREDENTIALS_KEY, {
      requireAuthentication: true,
      authenticationPrompt: PROMPT,
    })
  } catch {
    return null
  }
  if (!stored) return null
  try {
    const parsed = JSON.parse(stored) as Partial<BiometricCredentials>
    if (typeof parsed.mail === "string" && typeof parsed.password === "string") {
      return { mail: parsed.mail, password: parsed.password }
    }
  } catch {
    // fall through to null — an unreadable entry is no entry
  }
  return null
}

export async function clearBiometricCredentials(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(CREDENTIALS_KEY),
    SecureStore.deleteItemAsync(ENROLLED_KEY),
  ])
}
