"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { register as registerAction } from "@/lib/auth/actions"
import { RegisterSchema, type RegisterInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export default function RegisterPage() {
  const [serverState, formAction] = useActionState(registerAction, null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({
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
    <AuthCard>
      <AuthCardHeading title="Create account" subtitle="Start planning your expedition" />

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

        <div className="flex flex-col gap-1.5">
          <label htmlFor="username" className="auth-label">
            Username
          </label>
          <Input
            id="username"
            type="text"
            autoComplete="username"
            className="auth-input"
            {...register("username")}
          />
          {errors.username && <p className="text-[11px] text-red-600">{errors.username.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="auth-label">
            Full name
          </label>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            className="auth-input"
            {...register("name")}
          />
          {errors.name && <p className="text-[11px] text-red-600">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="auth-label">
            Phone
          </label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            className="auth-input"
            {...register("phone")}
          />
          {errors.phone && <p className="text-[11px] text-red-600">{errors.phone.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="auth-label">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="auth-input"
            {...register("password")}
          />
          {errors.password && <p className="text-[11px] text-red-600">{errors.password.message}</p>}
        </div>

        {serverState && !serverState.success && (
          <p className="auth-notice auth-notice-error">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="auth-btn mt-1">
          {isPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-[11px] text-[oklch(0.52_0.065_240)]">
        Already have an account?{" "}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
