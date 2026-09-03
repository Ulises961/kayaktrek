import { Redirect } from "expo-router"
import { useState } from "react"

import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Screen, Stack } from "../../components/ui/layout"
import { Text } from "../../components/ui/text"
import { useAuth } from "../../lib/auth/auth-context"

// Once signed in, expo-router's file-based routing takes over the redirect — no
// navigation call needed here, just render <Redirect>, same pattern as (app)/_layout.tsx.
export default function LoginScreen() {
  const { status, signIn } = useAuth()
  const [mail, setMail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  if (status === "authenticated") {
    return <Redirect href="/" />
  }

  async function handleSubmit() {
    setError(null)
    setIsPending(true)
    const result = await signIn(mail, password)
    setIsPending(false)
    if (!result.success) setError(result.error)
  }

  return (
    <Screen className="items-center justify-center p-6">
      <Stack className="w-full max-w-sm gap-4">
        <Text className="text-2xl font-semibold">Sign in</Text>

        <Stack className="gap-1.5">
          <Label>Email</Label>
          <Input
            value={mail}
            onChangeText={setMail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            testID="login-email"
          />
        </Stack>

        <Stack className="gap-1.5">
          <Label>Password</Label>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            testID="login-password"
          />
        </Stack>

        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

        <Button onPress={handleSubmit} disabled={isPending} testID="login-submit">
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </Stack>
    </Screen>
  )
}
