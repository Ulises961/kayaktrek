"use client"

import { useActionState } from "react"
import { register } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function RegisterPage() {
  const [state, action, isPending] = useActionState(register, null)

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
          <Input id="mail" name="mail" type="email" autoComplete="email" required />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="username" className="text-sm font-medium text-slate-700">
            Username
          </label>
          <Input id="username" name="username" type="text" autoComplete="username" required />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-slate-700">
            Full name
          </label>
          <Input id="name" name="name" type="text" autoComplete="name" required />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700">
            Phone
          </label>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" required />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required />
        </div>

        {state && !state.success && (
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
