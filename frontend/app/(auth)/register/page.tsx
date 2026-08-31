"use client"

import { useActionState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { register as registerAction } from "@/lib/auth/actions"
import { RegisterSchema, PASSWORD_RULES, type RegisterInput } from "@/lib/auth/schemas"
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

export default function RegisterPage() {
  const [serverState, formAction] = useActionState(registerAction, null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    mode: "onBlur",
  })

  const password = useWatch({ control, name: "password" }) ?? ""

  const onSubmit = handleSubmit(async (data) => {
    // The medical-notes keypair is generated here, in the browser, and its private half is
    // wrapped under the password before it is sent (M22) — the server never sees the key
    // material unwrapped. Doing it at sign-up rather than on first use means an account
    // can receive shared notes immediately. Costs one PBKDF2 derivation (~0.4s).
    const keypair = await generateKeypair(data.password)

    const fd = new FormData()
    fd.append("mail", data.mail)
    fd.append("username", data.username)
    fd.append("name", data.name)
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

        {serverState && !serverState.success && serverState.code !== "invalid_invite_code" && (
          <p className="auth-notice auth-notice-error">{serverState.error}</p>
        )}

        <Button type="submit" disabled={isPending} className="auth-btn mt-1">
          {isPending ? "Creating account…" : "Create account"}
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
        Already have an account?{" "}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </AuthCard>
  )
}
