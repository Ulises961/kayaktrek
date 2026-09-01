"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChangePasswordSchema, type ChangePasswordValues } from "@/lib/dtos/user"
import { changePassword, getKeypair, reAuth } from "@/lib/profile/actions"
import { decrypt, encrypt } from "@/lib/crypto/medical"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/common/password-input"
import { Label } from "@/components/ui/label"
import Link from "next/link"

interface ChangePasswordFormProps {
  /** Whether the account has a medical-notes keypair that needs re-wrapping (M22). */
  hasKeypair: boolean
}

export function ChangePasswordForm({ hasKeypair }: ChangePasswordFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(ChangePasswordSchema),
  })

  const onSubmit = handleSubmit(({ currentPwd, newPwd }) => {
    startTransition(async () => {
      if (!hasKeypair) {
        const result = await changePassword(currentPwd, newPwd)
        if (result.success) {
          reset()
          router.push("/settings?changed=1")
        } else if (result.error.toLowerCase().includes("current")) {
          setError("currentPwd", { message: result.error })
        } else {
          setError("root", { message: result.error })
        }
        return
      }

      // The private key is re-wrapped here, in the browser, before either password is
      // sent anywhere (M22) — re-auth is what proves currentPwd to the server, since the
      // password itself no longer travels on the medical-notes endpoints.
      const authResult = await reAuth(currentPwd)
      if (!authResult.success) {
        setError("currentPwd", { message: authResult.error })
        return
      }
      const keypairResult = await getKeypair(authResult.elevatedToken)
      if (!keypairResult.success) {
        setError("root", { message: keypairResult.error })
        return
      }
      let rewrappedKey
      try {
        const { privateKeyCiphertext, privateKeyNonce, privateKeySalt } = keypairResult.keypair
        const privateKeyB64 = await decrypt(
          privateKeyCiphertext,
          privateKeyNonce,
          privateKeySalt,
          currentPwd,
        )
        rewrappedKey = await encrypt(privateKeyB64, newPwd)
      } catch {
        setError("root", {
          message: "Could not re-encrypt your medical-notes key. Please try again.",
        })
        return
      }

      const result = await changePassword(currentPwd, newPwd, rewrappedKey)
      if (result.success) {
        reset()
        router.push("/settings?changed=1")
      } else if (result.error.toLowerCase().includes("current")) {
        setError("currentPwd", { message: result.error })
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPwd">Current password</Label>
        <PasswordInput
          id="currentPwd"
          autoComplete="current-password"
          disabled={isPending}
          {...register("currentPwd")}
        />
        {errors.currentPwd && (
          <p className="text-destructive text-xs">{errors.currentPwd.message}</p>
        )}
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground self-start text-xs underline underline-offset-2"
        >
          Forgot your current password?
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPwd">New password</Label>
        <PasswordInput
          id="newPwd"
          autoComplete="new-password"
          disabled={isPending}
          {...register("newPwd")}
        />
        {errors.newPwd && <p className="text-destructive text-xs">{errors.newPwd.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPwd">Confirm new password</Label>
        <PasswordInput
          id="confirmPwd"
          autoComplete="new-password"
          disabled={isPending}
          {...register("confirmPwd")}
        />
        {errors.confirmPwd && (
          <p className="text-destructive text-xs">{errors.confirmPwd.message}</p>
        )}
      </div>

      {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Updating…" : "Update password"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.push("/settings")}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
