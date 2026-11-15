"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { resendVerification } from "@/lib/auth/actions"
import { ResendVerificationSchema, type ResendVerificationInput } from "@/lib/auth/schemas"
import { SUPPORT_MAIL } from "@/lib/support"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

function SupportNote() {
  return (
    <p className="auth-footnote text-[11px]">
      Didn&apos;t get it?{" "}
      <a href={`mailto:${SUPPORT_MAIL}`} className="auth-link">
        Contact support
      </a>{" "}
      for help!
    </p>
  )
}

export function ResendVerificationForm() {
  const [serverState, formAction] = useActionState(resendVerification, null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResendVerificationInput>({
    resolver: zodResolver(ResendVerificationSchema),
    mode: "onBlur",
  })

  const onSubmit = handleSubmit((data) => {
    const fd = new FormData()
    fd.append("mail", data.mail)
    startTransition(() => formAction(fd))
  })

  if (serverState?.success) {
    return (
      <AuthCard>
        <AuthCardHeading title="Check your email" />
        <p className="auth-footnote text-[11px]">
          If that address has an unverified account, a verification link is on its way.
        </p>
        <SupportNote />
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
        subtitle="Enter the email you signed up with and we will send the link again."
      />

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

        {serverState && !serverState.success && (
          <p className="auth-notice auth-notice-error">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="auth-btn mt-1">
          {isPending ? "Sending…" : "Send verification email"}
        </Button>
      </form>

      <SupportNote />

      <p className="auth-footnote text-center text-[11px]">
        Already verified?{" "}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
