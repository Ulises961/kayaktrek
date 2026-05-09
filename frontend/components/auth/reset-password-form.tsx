"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { resetPassword } from "@/lib/auth/actions"
import { ResetPasswordInput, ResetPasswordSchema } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export function ResetPasswordForm({ token }: { token: string }) {
  const [serverState, formAction] = useActionState(resetPassword, null)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordInput>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { token },
    mode: "onBlur",
  })

  const onSubmit = handleSubmit((data) => {
    const fd = new FormData()
    fd.append("token", data.token)
    fd.append("password", data.password)
    fd.append("confirmPassword", data.confirmPassword)
    startTransition(() => formAction(fd))
  })

  return (
    <AuthCard>
      <AuthCardHeading title="Reset password" subtitle="Choose a new password for your account." />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" {...register("token")} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="auth-label">New password</label>
          <Input id="password" type="password" autoComplete="new-password" className="auth-input" {...register("password")} />
          {errors.password && <p className="text-[11px] text-red-600">{errors.password.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className="auth-label">Confirm password</label>
          <Input id="confirmPassword" type="password" autoComplete="new-password" className="auth-input" {...register("confirmPassword")} />
          {errors.confirmPassword && <p className="text-[11px] text-red-600">{errors.confirmPassword.message}</p>}
        </div>

        {serverState && !serverState.success && (
          <p className="auth-notice auth-notice-error">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="auth-btn mt-1">
          {isPending ? "Updating…" : "Update password"}
        </Button>
      </form>

      <p className="text-center text-[11px] text-[oklch(0.52_0.065_240)]">
        <Link href="/login" className="auth-link">Back to sign in</Link>
      </p>
    </AuthCard>
  )
}
