"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams } from "next/navigation"
import { login } from "@/lib/auth/actions"
import { LoginSchema, type LoginInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function LoginPage() {
  const [serverState, formAction] = useActionState(login, null)
  const [isPending, startTransition] = useTransition()
  const searchParams = useSearchParams()
  const registered = searchParams.get("registered") === "1"
  const passwordReset = searchParams.get("reset") === "1"

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
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
    <div className="flex flex-col gap-6 p-8 bg-white rounded-xl shadow-sm border border-slate-200">
      {registered && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          Account created — check your email to verify before signing in.
        </p>
      )}
      {passwordReset && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          Password updated — you can now sign in with your new password.
        </p>
      )}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-500 mt-1">Welcome back</p>
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

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2">
              Forgot password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
          {errors.password && (
            <p className="text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {serverState && !serverState.success && (
          <p className="text-sm text-red-600">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-center text-slate-500">
        No account?{" "}
        <Link href="/register" className="text-slate-900 font-medium underline underline-offset-2">
          Sign up
        </Link>
      </p>
    </div>
  )
}
