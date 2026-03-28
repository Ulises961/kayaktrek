"use client"

import { useActionState } from "react"
import { register } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function RegisterPage() {
  const [state, action, isPending] = useActionState(register, null)

  const fieldErrors = state && !state.success ? state.fieldErrors : undefined

  return (
    <div className="flex flex-col gap-6 p-8 bg-white rounded-xl shadow-sm border border-slate-200">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Create account</h1>
        <p className="text-sm text-slate-500 mt-1">Start planning your expedition</p>
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
          <label htmlFor="username" className="text-sm font-medium text-slate-700">
            Username
          </label>
          <Input id="username" name="username" type="text" autoComplete="username" />
          {fieldErrors?.username && (
            <p className="text-xs text-red-600">{fieldErrors.username[0]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-slate-700">
            Full name
          </label>
          <Input id="name" name="name" type="text" autoComplete="name" />
          {fieldErrors?.name && (
            <p className="text-xs text-red-600">{fieldErrors.name[0]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700">
            Phone
          </label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" />
          {fieldErrors?.phone && (
            <p className="text-xs text-red-600">{fieldErrors.phone[0]}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <Input id="password" name="password" type="password" autoComplete="new-password" />
          {fieldErrors?.password && (
            <p className="text-xs text-red-600">{fieldErrors.password[0]}</p>
          )}
        </div>

        {state && !state.success && !state.fieldErrors && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-center text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="text-slate-900 font-medium underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </div>
  )
}
