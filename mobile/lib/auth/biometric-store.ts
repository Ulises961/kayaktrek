import * as LocalAuthentication from "expo-local-authentication"
import * as SecureStore from "expo-secure-store"

// The fingerprint shortcut on the sign-in screen: the address and password sit in the Keystore-
// backed secure store, and the app asks for the fingerprint before it hands them over. The session
// tokens in token-store.ts live in the same store with no such prompt, so this adds a check in
// front of the password rather than a stronger lock on it.
//
// The check is the app's, not the key's. The key-level lock (`requireAuthentication` on
// expo-secure-store) asks Android for a STRONG biometric, and before Android 11 the sensor's
// strength cannot be read — the library trusts a hard-coded list of phones (two Pixels), so a
// Xiaomi Mi 8 on Android 10 is refused outright. The prompt here accepts any enrolled fingerprint.
const CREDENTIALS_KEY = "kayaktrek.biometric_credentials"
// Reading the credentials loads the secret, so whether they exist is kept in a second entry — the
// sign-in screen needs that answer to decide whether to show the button, before anyone has touched
// the sensor. It holds no secret.
const ENROLLED_KEY = "kayaktrek.biometric_enrolled"
const ENROLLED = "1"

const PROMPT = "Sign in to Kayaktrek"

export type BiometricCredentials = { mail: string; password: string }

// True when the phone has a fingerprint sensor with at least one finger enrolled. False, not an
// error, for every way of not knowing: the shortcut is a convenience that simply stays hidden.
export async function canUseBiometrics(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  } catch {
    return false
  }
}

// Shows the system fingerprint prompt. No device-PIN fallback: the point is that it is the finger.
async function confirmFingerprint(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: PROMPT,
      cancelLabel: "Cancel",
      disableDeviceFallback: true,
    })
    return result.success
  } catch {
    return false
  }
}

export async function hasBiometricCredentials(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENROLLED_KEY)) === ENROLLED
}

// Asks for the fingerprint first, so turning the shortcut on also proves it works on this phone.
// Returns whether anything was stored: false means the finger was not confirmed.
export async function saveBiometricCredentials(credentials: BiometricCredentials): Promise<boolean> {
  if (!(await confirmFingerprint())) return false
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify(credentials))
  await SecureStore.setItemAsync(ENROLLED_KEY, ENROLLED)
  return true
}

// Asks for the fingerprint and returns what it unlocks. Null for everything that is not "here are
// the credentials": the user cancelled, the sensor failed, or the entry is unreadable. The caller
// shows the password form in all of those cases, so none needs telling apart.
export async function readBiometricCredentials(): Promise<BiometricCredentials | null> {
  if (!(await confirmFingerprint())) return null
  let stored: string | null
  try {
    stored = await SecureStore.getItemAsync(CREDENTIALS_KEY)
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
