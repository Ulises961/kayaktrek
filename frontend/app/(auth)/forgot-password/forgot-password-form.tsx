"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { forgotPassword } from "@/lib/auth/actions"
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export function ForgotPasswordForm() {
  const [serverState, formAction] = useActionState(forgotPassword, null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(ForgotPasswordSchema),
    mode: "onBlur",
  })

  const onSubmit = handleSubmit((data) => {
    const fd = new FormData()
    fd.append("mail", data.mail)
    startTransition(() => formAction(fd))
  })

  if (serverState?.success) {
    return (
      <AuthCard>
        <AuthCardHeading title="Check your email" />
        <p className="auth-footnote text-[11px]">
          If that address is registered, a reset link has been sent.
        </p>
        <Link href="/login" className="auth-link text-[11px]">
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthCardHeading
        title="Forgot password"
        subtitle="Enter your email and we'll send a reset link."
      />

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

        {serverState && !serverState.success && (
          <p className="auth-notice auth-notice-error">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="auth-btn mt-1">
          {isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="auth-footnote text-center text-[11px]">
        Remembered it?{" "}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
