"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams } from "next/navigation"
import { login } from "@/lib/auth/actions"
import { LoginSchema, type LoginInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/common/password-input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export function LoginForm() {
  const [serverState, formAction] = useActionState(login, null)
  const [isPending, startTransition] = useTransition()
  const searchParams = useSearchParams()
  const registered = searchParams.get("registered") === "1"
  const passwordReset = searchParams.get("reset") === "1"

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    mode: "onBlur",
  })

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
        <div className="flex flex-col gap-1.5" suppressHydrationWarning>
          <label htmlFor="mail" className="auth-label">
            Email
          </label>
          <Input
            id="mail"
            type="email"
            autoComplete="email"
            suppressHydrationWarning
            className="auth-input"
            {...register("mail")}
          />
          {errors.mail && <p className="text-[11px] text-red-600">{errors.mail.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5" suppressHydrationWarning>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="auth-label">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-sm tracking-wide text-[oklch(0.52_0.065_240)] underline underline-offset-2 hover:text-[oklch(0.43_0.165_243)]"
            >
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

        <Button type="submit" disabled={isPending} className="auth-btn mt-1">
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-[oklch(0.52_0.065_240)]">
        No account?{" "}
        <Link href="/register" className="auth-link">
          Create one
        </Link>
      </p>
    </AuthCard>
  )
}
