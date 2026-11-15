import { Link, Redirect, useRouter } from "expo-router"
import { useState } from "react"
import { Linking, Pressable } from "react-native"

import { RegisterFormSchema } from "@shared/auth/schemas"

import { AuthScreen } from "../../components/auth/auth-screen"
import { PasswordRules } from "../../components/auth/password-rules"
import { Button } from "../../components/ui/button"
import { Card } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Row, Stack } from "../../components/ui/layout"
import { PasswordInput } from "../../components/ui/password-input"
import { Text } from "../../components/ui/text"
import { WEB_ORIGIN } from "../../lib/api/config"
import { register } from "../../lib/auth/actions"
import { useAuth } from "../../lib/auth/auth-context"
import { fieldErrors } from "../../lib/auth/field-errors"

export default function RegisterScreen() {
  const { status } = useAuth()
  const router = useRouter()
  const [mail, setMail] = useState("")
  const [confirmMail, setConfirmMail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  if (status === "authenticated") {
    return <Redirect href="/" />
  }

  async function handleSubmit() {
    setError(null)

    const parsed = RegisterFormSchema.safeParse({
      mail: mail.trim(),
      confirmMail,
      username: username.trim(),
      password,
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})

    setIsPending(true)
    const result = await register(parsed.data.mail, parsed.data.username, parsed.data.password)
    setIsPending(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    // The account is inactive until the emailed link is followed, so there is no session to
    // start: back to sign-in, which says what to do next.
    router.replace({ pathname: "/login", params: { registered: "1" } })
  }

  return (
    <AuthScreen>
      <Card className="w-full gap-5 p-6">
        <Stack className="gap-1">
          <Text className="text-2xl font-semibold">Create account</Text>
          <Text className="text-sm text-muted-foreground">Start planning your expedition</Text>
        </Stack>

        <Stack className="gap-1.5">
          <Label>Email</Label>
          <Input
            value={mail}
            onChangeText={setMail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            testID="register-email"
          />
          {errors.mail ? <Text className="text-sm text-destructive">{errors.mail}</Text> : null}
        </Stack>

        {/* Asked twice because the account is useless until a mail reaches this address: a
            typo here strands it behind a verification link that goes to a stranger. */}
        <Stack className="gap-1.5">
          <Label>Confirm email</Label>
          <Input
            value={confirmMail}
            onChangeText={setConfirmMail}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
            keyboardType="email-address"
            testID="register-confirm-email"
          />
          {errors.confirmMail ? (
            <Text className="text-sm text-destructive">{errors.confirmMail}</Text>
          ) : null}
        </Stack>

        <Stack className="gap-1.5">
          <Label>Username</Label>
          <Input
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username-new"
            autoCorrect={false}
            testID="register-username"
          />
          {errors.username ? (
            <Text className="text-sm text-destructive">{errors.username}</Text>
          ) : null}
        </Stack>

        <Stack className="gap-1.5">
          <Label>Password</Label>
          <PasswordInput
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            testID="register-password"
          />
          <PasswordRules password={password} />
          {errors.password ? (
            <Text className="text-sm text-destructive">{errors.password}</Text>
          ) : null}
        </Stack>

        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

        <Button onPress={handleSubmit} disabled={isPending} testID="register-submit">
          {isPending ? "Creating account…" : "Create account"}
        </Button>

        <Text className="text-center text-[11px] text-muted-foreground">
          By creating an account, you agree to our{" "}
          <Text
            className="text-[11px] text-primary"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${WEB_ORIGIN}/terms`)}
            testID="register-terms"
          >
            Terms of Use
          </Text>{" "}
          and{" "}
          <Text
            className="text-[11px] text-primary"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${WEB_ORIGIN}/privacy`)}
            testID="register-privacy"
          >
            Privacy Policy
          </Text>
          .
        </Text>

        <Row className="justify-center gap-1">
          <Text className="text-sm text-muted-foreground">Have an account?</Text>
          <Link href="/login" asChild>
            <Pressable accessibilityRole="link" hitSlop={8} testID="register-sign-in">
              <Text className="text-sm text-primary">Sign in</Text>
            </Pressable>
          </Link>
        </Row>
      </Card>
    </AuthScreen>
  )
}
