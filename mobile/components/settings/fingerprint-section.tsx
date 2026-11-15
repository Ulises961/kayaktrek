import { useEffect, useState } from "react"
import { ActivityIndicator, Switch } from "react-native"

import { Button } from "@mobile/components/ui/button"
import { Label } from "@mobile/components/ui/label"
import { Row, Stack } from "@mobile/components/ui/layout"
import { PasswordInput } from "@mobile/components/ui/password-input"
import { Text } from "@mobile/components/ui/text"
import {
  canUseBiometrics,
  clearBiometricCredentials,
  hasBiometricCredentials,
  saveBiometricCredentials,
} from "@mobile/lib/auth/biometric-store"
import { reAuthenticate } from "@mobile/lib/profile/actions"

function message(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

// The place to turn the sign-in screen's fingerprint shortcut on and off at any time, so it does
// not depend on catching the one-off offer after a password sign-in.
//
// Turning it on needs the password — it is what gets stored, and Settings never holds it — and
// the password is checked with the server first, so a typo cannot be saved and only discovered
// later at the sign-in screen.
export function FingerprintSection({ mail }: { mail: string }) {
  // null until the phone and the store have both answered.
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [asking, setAsking] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([hasBiometricCredentials(), canUseBiometrics()]).then(([saved, usable]) => {
      if (cancelled) return
      setEnabled(saved)
      setAvailable(usable)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function cancel() {
    setAsking(false)
    setPassword("")
    setError(null)
  }

  async function turnOff() {
    await clearBiometricCredentials()
    setEnabled(false)
    cancel()
  }

  async function turnOn() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await reAuthenticate(password)
      const stored = await saveBiometricCredentials({ mail, password })
      if (!stored) {
        setError("The fingerprint was not confirmed, so fingerprint sign-in stays off.")
        return
      }
      setEnabled(true)
      cancel()
    } catch (err) {
      setError(message(err, "Could not turn on fingerprint sign-in."))
    } finally {
      setBusy(false)
    }
  }

  if (enabled === null || available === null) return <ActivityIndicator />

  // Nothing to switch on, and nothing set up to switch off.
  if (!enabled && !available) {
    return (
      <Text className="text-sm text-muted-foreground">
        Set up a fingerprint in your phone&apos;s settings first, then come back here to use it to
        sign in to Kayaktrek.
      </Text>
    )
  }

  return (
    <Stack className="gap-3">
      <Text className="text-sm text-muted-foreground">
        Sign in with your fingerprint instead of typing your password. Your email and password are
        kept on this phone, and the app asks for your fingerprint before using them. Signing out
        everywhere turns it off. After you change your password, sign in with the new one once to
        set it up again.
      </Text>

      <Row className="items-center gap-2">
        <Switch
          // Reflects what is stored, not what was asked for: the form below is a question, and
          // the switch only flips once the answer has been checked and saved.
          value={enabled}
          onValueChange={(next) => {
            if (!next) {
              void turnOff()
            } else {
              setAsking(true)
            }
          }}
          accessibilityLabel="Fingerprint sign-in"
          testID="fingerprint-switch"
        />
        <Label>Fingerprint sign-in</Label>
      </Row>

      {asking && (
        <Stack className="gap-2 rounded-lg border border-border p-4">
          <Label>Confirm your password</Label>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            testID="fingerprint-password"
          />
          {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
          <Row className="gap-2">
            <Button
              size="sm"
              onPress={() => void turnOn()}
              disabled={busy || password.length === 0}
              testID="fingerprint-confirm"
            >
              {busy ? "Checking…" : "Turn on"}
            </Button>
            <Button variant="outline" size="sm" onPress={cancel} testID="fingerprint-cancel">
              Cancel
            </Button>
          </Row>
        </Stack>
      )}
    </Stack>
  )
}
