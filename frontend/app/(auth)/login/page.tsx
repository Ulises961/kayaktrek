"use client"

import { useActionState } from "react"
import { login } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function LoginPage() {
  const [state, action, isPending] = useActionState(login, null)

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined

  return (
    <div className="flex flex-col gap-6 p-8 bg-white rounded-xl shadow-sm border border-slate-200">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-500 mt-1">Welcome back</p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="mail" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <Input id="mail" name="mail" type="email" autoComplete="email" />
          {fieldErrors?.mail && (
            <p className="text-xs text-red-600">{fieldErrors.mail[0]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <Input id="password" name="password" type="password" autoComplete="current-password" />
          {fieldErrors?.password && (
            <p className="text-xs text-red-600">{fieldErrors.password[0]}</p>
          )}
        </div>

        {state && !state.success && !state.fieldErrors && (
          <p className="text-sm text-red-600">{state.error}</p>
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
