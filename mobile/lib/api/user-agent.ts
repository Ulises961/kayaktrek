import Constants from "expo-constants"
import { Platform } from "react-native"

/**
 * How this app identifies itself to our backend, e.g. `Kayaktrek/1.0.12 (Android 34; Pixel 8)`.
 *
 * React Native sends okhttp/… on Android and CFNetwork/… on iOS, and neither matches any
 * browser or platform token `Services/Utils/client_identity.py` looks for — so every phone
 * in the "Your devices" list read "Unknown device", which is exactly the row a paddler needs
 * to recognise when deciding whether a session is theirs.
 *
 * Built from what the runtime already knows, so this costs no new package and no prebuild.
 * Android exposes a model name; iOS does not (Apple gives apps no model string), so iOS
 * contributes its OS version alone and the backend renders "Kayaktrek app on iOS".
 */
export function appUserAgent(): string {
  const version = Constants.expoConfig?.version ?? "dev"
  const detail = [`${Platform.OS === "ios" ? "iOS" : "Android"} ${Platform.Version}`]

  const model = Platform.OS === "android" ? Platform.constants?.Model : undefined
  if (model) detail.push(String(model))

  return `Kayaktrek/${version} (${detail.join("; ")})`
}
