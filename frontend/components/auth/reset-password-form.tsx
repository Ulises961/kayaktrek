"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { resetPassword } from "@/lib/auth/actions"
import { ResetPasswordInput, ResetPasswordSchema } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { z } from "zod"


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
    <div className="flex flex-col gap-6 p-8 bg-white rounded-xl shadow-sm border border-slate-200">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Reset password</h1>
        <p className="text-sm text-slate-500 mt-1">Choose a new password for your account.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" {...register("token")} />

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            New password
          </label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          {errors.password && (
            <p className="text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700">
            Confirm password
          </label>
          <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
          {errors.confirmPassword && (
            <p className="text-xs text-red-600">{errors.confirmPassword.message}</p>
          )}
        </div>

        {serverState && !serverState.success && (
          <p className="text-sm text-red-600">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Updating…" : "Update password"}
        </Button>
      </form>

      <p className="text-sm text-center text-slate-500">
        <Link href="/login" className="text-slate-900 font-medium underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
