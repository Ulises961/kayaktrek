import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

import { getAccessToken } from "./token-store"
import { onSessionExpired } from "./session-events"
import { login as loginAction, logout as logoutAction, type LoginResult } from "./actions"

type AuthStatus = "loading" | "authenticated" | "unauthenticated"

type AuthContextValue = {
  status: AuthStatus
  signIn: (mail: string, password: string) => Promise<LoginResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Every M9b screen is authenticated-only — there is no anonymous surface on mobile yet
// (unlike the web client's (public) route group), so "unauthenticated" always means
// "show the login screen", never "render a public view". See the M9b plan WP1.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading")

  useEffect(() => {
    let cancelled = false

    getAccessToken().then((token) => {
      if (!cancelled) setStatus(token ? "authenticated" : "unauthenticated")
    })

    // Fires when lib/api/client.ts's refresh-retry gives up — the RN analogue of the web
    // client's apiFetch calling redirect("/login") on a dead session.
    onSessionExpired(() => setStatus("unauthenticated"))

    return () => {
      cancelled = true
    }
  }, [])

  async function signIn(mail: string, password: string): Promise<LoginResult> {
    const result = await loginAction(mail, password)
    if (result.success) setStatus("authenticated")
    return result
  }

  async function signOut(): Promise<void> {
    await logoutAction()
    setStatus("unauthenticated")
  }

  return (
    <AuthContext.Provider value={{ status, signIn, signOut }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
