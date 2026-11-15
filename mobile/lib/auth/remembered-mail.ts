import * as SecureStore from "expo-secure-store"

// The address last signed in with, so the login screen opens with it filled in. Deliberately kept
// across sign-out (that is the point) and not gated behind a biometric: it is not a credential,
// and the whole purpose is to be there before anyone has proved anything.
const REMEMBERED_MAIL_KEY = "kayaktrek.remembered_mail"

// Convenience only: a store that cannot be read or written must never get in the way of signing
// in, so both directions swallow the failure and the form simply starts empty.
export async function readRememberedMail(): Promise<string> {
  try {
    return (await SecureStore.getItemAsync(REMEMBERED_MAIL_KEY)) ?? ""
  } catch {
    return ""
  }
}

export async function rememberMail(mail: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(REMEMBERED_MAIL_KEY, mail)
  } catch {
    // See above: not remembering is a missing convenience, not a failed sign-in.
  }
}
