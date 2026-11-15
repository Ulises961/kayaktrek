"use client"

import { useActionState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { register as registerAction } from "@/lib/auth/actions"
import { RegisterFormSchema, PASSWORD_RULES, type RegisterFormInput } from "@/lib/auth/schemas"
import { generateKeypair } from "@/lib/crypto/medical"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/common/password-input"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

// Always-visible password checklist — rules up front, ticking live as the user
// types, instead of surprising them with a validation error on blur (M12 §F).
function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="flex flex-col gap-0.5" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li
            key={rule.label}
            className={cn(
              "flex items-center gap-1.5 text-[11px]",
              met ? "text-[oklch(0.52_0.1_165)]" : "text-[oklch(0.52_0.065_240)]",
            )}
          >
            <CheckIcon className={cn("size-3 shrink-0", met ? "opacity-100" : "opacity-30")} />
            {rule.label}
          </li>
        )
      })}
    </ul>
  )
}

export function RegisterForm({ inviteCodeRequired }: { inviteCodeRequired: boolean }) {
  const [serverState, formAction] = useActionState(registerAction, null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormInput>({
    resolver: zodResolver(RegisterFormSchema),
    mode: "onBlur",
  })

  const password = useWatch({ control, name: "password" }) ?? ""
  // isSubmitting covers the keypair generation below (react-hook-form sets it for the
  // lifetime of this async handler); isPending covers the transitioned formAction call
  // after it. Together they span the whole submit with no gap — isPending alone leaves the
  // ~0.4s keypair derivation looking like an unresponsive button, since startTransition
  // hasn't been called yet during that window.
  const submitPending = isSubmitting || isPending

  const onSubmit = handleSubmit(async (data) => {
    // The medical-notes keypair is generated here, in the browser, and its private half is
    // wrapped under the password before it is sent (M22) — the server never sees the key
    // material unwrapped. Doing it at sign-up rather than on first use means an account
    // can receive shared notes immediately. Costs one PBKDF2 derivation (~0.4s).
    //
    // Kept running while medical notes are parked (docs/adr/safety-privacy.md "Parked",
    // 2026-09-02), deliberately: a keypair is generic X25519 material, not health data, and
    // generating one for every account is what keeps unparking a single environment variable
    // rather than a re-key prompt for everyone who signed up in the meantime.
    const keypair = await generateKeypair(data.password)

    const fd = new FormData()
    fd.append("mail", data.mail)
    fd.append("username", data.username)
    if (data.inviteCode) fd.append("inviteCode", data.inviteCode)
    fd.append("password", data.password)
    fd.append("publicKey", keypair.publicKey)
    fd.append("privateKeyCiphertext", keypair.privateKeyCiphertext)
    fd.append("privateKeyNonce", keypair.privateKeyNonce)
    fd.append("privateKeySalt", keypair.privateKeySalt)
    startTransition(() => formAction(fd))
  })

  return (
    <AuthCard>
      <AuthCardHeading title="Create account" subtitle="Start planning your expedition" />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {inviteCodeRequired && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="inviteCode" className="auth-label">
              Invite code
            </label>
            <Input
              id="inviteCode"
              type="text"
              autoComplete="off"
              className="auth-input"
              {...register("inviteCode")}
            />
            {errors.inviteCode && (
              <p className="text-[11px] text-red-600">{errors.inviteCode.message}</p>
            )}
            {serverState && !serverState.success && serverState.code === "invalid_invite_code" && (
              <p className="text-[11px] text-red-600">{serverState.error}</p>
            )}
          </div>
        )}

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
          <label htmlFor="confirmMail" className="auth-label">
            Confirm email
          </label>
          <Input
            id="confirmMail"
            type="email"
            autoComplete="off"
            className="auth-input"
            {...register("confirmMail")}
          />
          {errors.confirmMail && (
            <p className="text-[11px] text-red-600">{errors.confirmMail.message}</p>
          )}
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
          <label htmlFor="password" className="auth-label">
            Password
          </label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            className="auth-input"
            {...register("password")}
          />
          <PasswordRules password={password} />
          {errors.password && <p className="text-[11px] text-red-600">{errors.password.message}</p>}
        </div>

        {serverState &&
          !serverState.success &&
          !(inviteCodeRequired && serverState.code === "invalid_invite_code") && (
            <p className="auth-notice auth-notice-error">{serverState.error}</p>
          )}

        <Button type="submit" disabled={submitPending} className="auth-btn mt-1">
          {submitPending ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="auth-footnote text-center text-[11px]">
        By creating an account, you agree to our{" "}
        <Link href="/terms" className="auth-link">
          Terms of Use
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="auth-link">
          Privacy Policy
        </Link>
        .
      </p>

      <p className="auth-footnote text-center text-sm">
        Have an account?{" "}
        <Link href="/login" className="auth-link whitespace-nowrap">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
