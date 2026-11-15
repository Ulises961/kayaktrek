"use client"

import { useActionState, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { correctUnverifiedMail } from "@/lib/auth/actions"
import { CorrectUnverifiedMailSchema, type CorrectUnverifiedMailInput } from "@/lib/auth/schemas"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/common/password-input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export function ResendVerificationForm() {
  const [serverState, formAction] = useActionState(correctUnverifiedMail, null)
  const [isPending, startTransition] = useTransition()
  const [sentTo, setSentTo] = useState("")

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CorrectUnverifiedMailInput>({
    resolver: zodResolver(CorrectUnverifiedMailSchema),
    mode: "onBlur",
  })

  const newMail = useWatch({ control, name: "newMail" }) ?? ""

  const onSubmit = handleSubmit((data) => {
    const correctedMail = data.newMail?.trim() ?? ""
    const fd = new FormData()
    fd.append("mail", data.mail)
    fd.append("password", data.password)
    fd.append("newMail", correctedMail)
    fd.append("confirmNewMail", data.confirmNewMail ?? "")
    setSentTo(correctedMail || data.mail)
    startTransition(() => formAction(fd))
  })

  if (serverState?.success) {
    return (
      <AuthCard>
        <AuthCardHeading title="Check your email" />
        <p className="auth-footnote text-[11px]">
          If that address can be used, a verification link is on its way to{" "}
          <strong>{sentTo}</strong>. If that is not spelled right, reload this page and correct it.
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
        title="Resend verification email"
        subtitle="Didn't get it, or typed your email wrong when you signed up?"
      />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mail" className="auth-label">
            Email you signed up with
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
          <label htmlFor="password" className="auth-label">
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            className="auth-input"
            {...register("password")}
          />
          {errors.password && <p className="text-[11px] text-red-600">{errors.password.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="newMail" className="auth-label">
            Correct email address (only if you mistyped it)
          </label>
          <Input
            id="newMail"
            type="email"
            autoComplete="off"
            className="auth-input"
            {...register("newMail")}
          />
          {errors.newMail && <p className="text-[11px] text-red-600">{errors.newMail.message}</p>}
        </div>

        {newMail.trim() !== "" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmNewMail" className="auth-label">
              Confirm correct email address
            </label>
            <Input
              id="confirmNewMail"
              type="email"
              autoComplete="off"
              className="auth-input"
              {...register("confirmNewMail")}
            />
            {errors.confirmNewMail && (
              <p className="text-[11px] text-red-600">{errors.confirmNewMail.message}</p>
            )}
          </div>
        )}

        {serverState && !serverState.success && (
          <p className="auth-notice auth-notice-error">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="auth-btn mt-1">
          {isPending ? "Sending…" : "Send verification email"}
        </Button>
      </form>

      <p className="auth-footnote text-center text-[11px]">
        Already verified?{" "}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
