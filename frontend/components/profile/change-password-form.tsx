"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ChangePasswordSchema, type ChangePasswordValues } from "@/lib/dtos/user"
import { changePassword } from "@/lib/profile/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"

export function ChangePasswordForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<ChangePasswordValues>({
    resolver: zodResolver(ChangePasswordSchema),
  })

  const onSubmit = handleSubmit(({ currentPwd, newPwd }) => {
    startTransition(async () => {
      const result = await changePassword(currentPwd, newPwd)
      if (result.success) {
        reset()
        router.push("/profile?changed=1")
      } else {
        if (result.error.toLowerCase().includes("current")) {
          setError("currentPwd", { message: result.error })
        } else {
          setError("root", { message: result.error })
        }
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPwd">Current password</Label>
        <Input id="currentPwd" type="password" autoComplete="current-password" disabled={isPending} {...register("currentPwd")} />
        {errors.currentPwd && <p className="text-xs text-destructive">{errors.currentPwd.message}</p>}
        <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 self-start">
          Forgot your current password?
        </Link>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="newPwd">New password</Label>
        <Input id="newPwd" type="password" autoComplete="new-password" disabled={isPending} {...register("newPwd")} />
        {errors.newPwd && <p className="text-xs text-destructive">{errors.newPwd.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPwd">Confirm new password</Label>
        <Input id="confirmPwd" type="password" autoComplete="new-password" disabled={isPending} {...register("confirmPwd")} />
        {errors.confirmPwd && <p className="text-xs text-destructive">{errors.confirmPwd.message}</p>}
      </div>

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Updating…" : "Update password"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/profile")}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
