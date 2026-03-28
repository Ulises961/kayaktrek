"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { register as registerAction } from "@/lib/auth/actions"
import { RegisterSchema, type RegisterInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"

export default function RegisterPage() {
  const [serverState, formAction] = useActionState(registerAction, null)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    mode: "onBlur",
  })

  const onSubmit = handleSubmit((data) => {
    const fd = new FormData()
    fd.append("mail", data.mail)
    fd.append("username", data.username)
    fd.append("name", data.name)
    fd.append("phone", data.phone)
    fd.append("password", data.password)
    startTransition(() => formAction(fd))
  })

  return (
    <div className="flex flex-col gap-6 p-8 bg-white rounded-xl shadow-sm border border-slate-200">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Create account</h1>
        <p className="text-sm text-slate-500 mt-1">Start planning your expedition</p>
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
          <label htmlFor="username" className="text-sm font-medium text-slate-700">
            Username
          </label>
          <Input id="username" type="text" autoComplete="username" {...register("username")} />
          {errors.username && (
            <p className="text-xs text-red-600">{errors.username.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-slate-700">
            Full name
          </label>
          <Input id="name" type="text" autoComplete="name" {...register("name")} />
          {errors.name && (
            <p className="text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium text-slate-700">
            Phone
          </label>
          <Input id="phone" type="tel" autoComplete="tel" {...register("phone")} />
          {errors.phone && (
            <p className="text-xs text-red-600">{errors.phone.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          {errors.password && (
            <p className="text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {serverState && !serverState.success && (
          <p className="text-sm text-red-600">{serverState.error}</p>
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
