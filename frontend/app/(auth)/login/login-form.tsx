"use client"

import { useActionState, useEffect, useRef, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter, useSearchParams } from "next/navigation"
import { login } from "@/lib/auth/actions"
import { backfillKeypair } from "@/lib/crypto/keypair-backfill"
import { LoginSchema, type LoginInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/common/password-input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export function LoginForm() {
  const [serverState, formAction] = useActionState(login, null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()
  const registered = searchParams.get("registered") === "1"
  const passwordReset = searchParams.get("reset") === "1"

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    mode: "onBlur",
  })

  // Sign-in succeeded but the account has no X25519 keypair — a password reset clears it,
  // and only the browser can rebuild one, because the private half is wrapped under a key
  // derived from the password. This is the last moment that password exists anywhere, so the
  // work happens here rather than behind a prompt the parked medical-notes flag hides.
  //
  // Deliberately silent and best-effort: the user is already signed in by the time this runs,
  // so the navigation is in a `finally` and a failure costs nothing but another attempt at
  // the next sign-in. The ref guards against a second run, since an effect keyed on
  // serverState would otherwise fire again on re-render (and twice over in Strict Mode).
  const needsKeypair = serverState?.success === true && serverState.needsKeypair === true
  const backfillStarted = useRef(false)

  useEffect(() => {
    if (!needsKeypair || backfillStarted.current) return
    backfillStarted.current = true

    const finish = async () => {
      try {
        await backfillKeypair(getValues("password"))
      } catch {
        // Swallowed, not just survived: the user is signed in regardless, and letting this
        // reject would surface a console error about a step they never asked for. The next
        // sign-in tries again.
      } finally {
        router.replace("/dashboard")
      }
    }
    void finish()
  }, [needsKeypair, getValues, router])

  const onSubmit = handleSubmit((data) => {
    const fd = new FormData()
    fd.append("mail", data.mail)
    fd.append("password", data.password)
    startTransition(() => formAction(fd))
  })

  return (
    <AuthCard>
      {registered && (
        <p className="auth-notice auth-notice-success">
          Account created — check your email to verify before signing in.
        </p>
      )}
      {passwordReset && (
        <p className="auth-notice auth-notice-success">
          Password updated — you can now sign in with your new password.
        </p>
      )}

      <AuthCardHeading title="Sign in" subtitle="Welcome back" />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mail" className="auth-label">
            Email
          </label>
          <Input
            id="mail"
            type="email"
            autoComplete="email"
            className="auth-input"
            {...register("mail")}
          />
          {errors.mail && <p className="text-[11px] text-red-600">{errors.mail.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <Link href="/forgot-password" className="auth-link text-xs">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            className="auth-input"
            {...register("password")}
          />
          {errors.password && <p className="text-[11px] text-red-600">{errors.password.message}</p>}
        </div>

        {serverState &&
          !serverState.success &&
          (serverState.code === "deletion_pending" ? (
            <div className="auth-notice auth-notice-warning flex flex-col gap-1.5">
              <p className="font-medium">This account is scheduled for deletion.</p>
              <p>
                Check your email for a cancellation link, or{" "}
                <Link href="/cancel-deletion" className="auth-link">
                  request a new one here
                </Link>
                .
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-red-600" data-testid="auth-error">
              {serverState.error}
            </p>
          ))}

        {/* The backfill runs after the action resolves, so isPending alone would drop the
            button back to idle while the page is still about to navigate. */}
        <Button type="submit" disabled={isPending || needsKeypair} className="auth-btn mt-1">
          {isPending || needsKeypair ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="auth-footnote text-center">
        No account?{" "}
        <Link href="/register" className="auth-link">
          Create one
        </Link>
      </p>

      <p className="auth-footnote text-center text-[11px]">
        <Link href="/resend-verification" className="auth-link">
          Didn&apos;t get your verification email?
        </Link>
      </p>
    </AuthCard>
  )
}
