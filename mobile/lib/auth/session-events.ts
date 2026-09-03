// A tiny pub-sub so lib/api/client.ts (no React, no navigation dependency — testable in
// isolation) can announce "the session is dead" without importing expo-router or the auth
// context directly. AuthProvider is the sole subscriber: it clears its state, and the
// (app) layout's <Redirect> (driven by that state) sends the user back to login — the RN
// analogue of the web client's `redirect("/login")` inside apiFetch, which can't be done
// imperatively here since there's no throw-based navigation primitive in React Native.
type Listener = () => void

let listener: Listener | null = null

export function onSessionExpired(callback: Listener): void {
  listener = callback
}

export function notifySessionExpired(): void {
  listener?.()
}
