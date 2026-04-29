"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { forgotPassword } from "@/lib/auth/actions"
import { ForgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function ForgotPasswordPage() {
  const [serverState, formAction] = useActionState(forgotPassword, null)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, formState: { errors } } = useForm<ForgotPasswordInput>({
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
      <div className="flex flex-col gap-4 p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-500">
          If that address is registered, a reset link has been sent.
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-slate-900 underline underline-offset-2"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-8 bg-white rounded-xl shadow-sm border border-slate-200">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Forgot password</h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="mail" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <Input id="mail" type="email" autoComplete="email" {...register("mail")} />
          {errors.mail && (
            <p className="text-xs text-red-600">{errors.mail.message}</p>
          )}
        </div>

        {serverState && !serverState.success && (
          <p className="text-sm text-red-600">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <p className="text-sm text-center text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="text-slate-900 font-medium underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  )
}
