import { Link, Redirect, useLocalSearchParams } from "expo-router"
import { FingerprintPatternIcon } from "lucide-react-native"
import { useEffect, useState } from "react"
import { Alert, Linking, Pressable } from "react-native"

import { LoginSchema } from "@shared/auth/schemas"
import { palette } from "@shared/tokens"

import { AuthScreen } from "../../components/auth/auth-screen"
import { Button } from "../../components/ui/button"
import { Card } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Row, Stack } from "../../components/ui/layout"
import { PasswordInput } from "../../components/ui/password-input"
import { Text } from "../../components/ui/text"
import { WEB_ORIGIN } from "../../lib/api/config"
import { DELETION_PENDING, INVALID_CREDENTIALS } from "../../lib/auth/actions"
import { useAuth } from "../../lib/auth/auth-context"
import {
  canUseBiometrics,
  clearBiometricCredentials,
  hasBiometricCredentials,
  readBiometricCredentials,
  saveBiometricCredentials,
} from "../../lib/auth/biometric-store"
import { fieldErrors } from "../../lib/auth/field-errors"
import { readRememberedMail, rememberMail } from "../../lib/auth/remembered-mail"

const REGISTERED_FLAG = "1"

// Once signed in, expo-router's file-based routing takes over the redirect — no
// navigation call needed here, just render <Redirect>, same pattern as (app)/_layout.tsx.
export default function LoginScreen() {
  const { status, signIn } = useAuth()
  // Set by the register screen on its way here, so the account-created notice survives the
  // navigation without any shared state.
  const { registered } = useLocalSearchParams<{ registered?: string }>()
  const [mail, setMail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string | undefined>()
  const [isPending, setIsPending] = useState(false)
  const [fingerprintSaved, setFingerprintSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Only fills an untouched field: if the user already started typing, theirs wins.
    void readRememberedMail().then((remembered) => {
      if (!cancelled && remembered) setMail((typed) => typed || remembered)
    })
    void hasBiometricCredentials().then((saved) => {
      if (!cancelled) setFingerprintSaved(saved)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (status === "authenticated") {
    return <Redirect href="/" />
  }

  // Offered once, right after a password sign-in that worked — the one moment the password is
  // known to be right and the user is looking at the phone. Declining costs nothing and the
  // question comes back the next time they sign in by password.
  function offerFingerprint(credentials: { mail: string; password: string }) {
    if (fingerprintSaved || !canUseBiometrics()) return
    Alert.alert(
      "Use your fingerprint next time?",
      "Your email and password are kept on this phone, locked behind your fingerprint.",
      [
        { text: "Not now", style: "cancel" },
        { text: "Use fingerprint", onPress: () => void saveBiometricCredentials(credentials) },
      ],
    )
  }

  async function handleSubmit() {
    setError(null)
    setCode(undefined)

    const parsed = LoginSchema.safeParse({ mail: mail.trim(), password })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})

    setIsPending(true)
    const result = await signIn(parsed.data.mail, parsed.data.password)
    setIsPending(false)
    if (result.success) {
      void rememberMail(parsed.data.mail)
      offerFingerprint(parsed.data)
      return
    }
    setError(result.error)
    setCode(result.code)
  }

  async function handleFingerprint() {
    setError(null)
    setCode(undefined)
    setErrors({})

    const saved = await readBiometricCredentials()
    // Cancelled, or the phone's fingerprints changed and the key was invalidated: either way the
    // password form is what is left, and it is already on screen.
    if (!saved) return

    setIsPending(true)
    const result = await signIn(saved.mail, saved.password)
    setIsPending(false)
    if (result.success) return

    // A refused password means the one on file is stale (it was changed elsewhere), so the
    // shortcut is dropped and offered again after the next password sign-in. Anything else — no
    // signal, a server hiccup — says nothing about the saved password, which is kept.
    if (result.code === INVALID_CREDENTIALS) {
      await clearBiometricCredentials()
      setFingerprintSaved(false)
      setError("Your saved password is out of date. Sign in with your password.")
      return
    }
    setError(result.error)
    setCode(result.code)
  }

  return (
    <AuthScreen>
      <Card className="w-full gap-6 p-6">
        {registered === REGISTERED_FLAG && (
          <Text className="text-sm text-foreground" testID="login-registered-notice">
            Account created — check your email to verify before signing in.
          </Text>
        )}

        <Text className="text-2xl font-semibold">Sign in</Text>

        <Stack className="gap-1.5">
          <Label>Email</Label>
          <Input
            value={mail}
            onChangeText={setMail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            testID="login-email"
          />
          {errors.mail ? <Text className="text-sm text-destructive">{errors.mail}</Text> : null}
        </Stack>

        <Stack className="gap-1.5">
          <Row className="justify-between">
            <Label>Password</Label>
            <Pressable
              onPress={() => void Linking.openURL(`${WEB_ORIGIN}/forgot-password`)}
              accessibilityRole="link"
              hitSlop={8}
              testID="login-forgot-password"
            >
              <Text className="text-sm text-primary">Forgot password?</Text>
            </Pressable>
          </Row>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            testID="login-password"
          />
          {errors.password ? (
            <Text className="text-sm text-destructive">{errors.password}</Text>
          ) : null}
        </Stack>

        {code === DELETION_PENDING ? (
          <Stack className="gap-1.5" testID="login-deletion-pending">
            <Text className="text-sm font-medium">This account is scheduled for deletion.</Text>
            <Text className="text-sm text-muted-foreground">
              Check your email for a cancellation link, or request a new one.
            </Text>
            <Pressable
              onPress={() => void Linking.openURL(`${WEB_ORIGIN}/cancel-deletion`)}
              accessibilityRole="link"
              hitSlop={8}
              testID="login-cancel-deletion"
            >
              <Text className="text-sm text-primary">Request a new link</Text>
            </Pressable>
          </Stack>
        ) : error ? (
          <Text className="text-sm text-destructive">{error}</Text>
        ) : null}

        <Stack className="gap-3">
          <Button onPress={handleSubmit} disabled={isPending} testID="login-submit">
            {isPending ? "Signing in…" : "Sign in"}
          </Button>

          {fingerprintSaved ? (
            <Button
              variant="outline"
              onPress={handleFingerprint}
              disabled={isPending}
              icon={<FingerprintPatternIcon size={20} color={palette.ocean500} />}
              testID="login-fingerprint"
            >
              Sign in with fingerprint
            </Button>
          ) : null}
        </Stack>

        <Row className="justify-center gap-1">
          <Text className="text-sm text-muted-foreground">No account?</Text>
          <Link href="/register" asChild>
            <Pressable accessibilityRole="link" hitSlop={8} testID="login-create-account">
              <Text className="text-sm text-primary">Create one</Text>
            </Pressable>
          </Link>
        </Row>
      </Card>
    </AuthScreen>
  )
}
