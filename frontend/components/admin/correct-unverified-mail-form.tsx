"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldError, FieldLabel } from "@/components/common/form-field"
import { correctUnverifiedMail } from "@/lib/admin/actions"
import { CorrectUnverifiedMailSchema, type CorrectUnverifiedMailInput } from "@/lib/admin/schemas"

export function CorrectUnverifiedMailForm() {
  const [result, formAction] = useActionState(correctUnverifiedMail, null)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CorrectUnverifiedMailInput>({
    resolver: zodResolver(CorrectUnverifiedMailSchema),
    mode: "onBlur",
  })

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData()
    formData.append("username", data.username)
    formData.append("newMail", data.newMail)
    startTransition(() => formAction(formData))
  })

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="username">Username</FieldLabel>
        <Input id="username" type="text" autoComplete="off" {...register("username")} />
        <FieldError message={errors.username?.message} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="newMail">Correct email address</FieldLabel>
        <Input id="newMail" type="email" autoComplete="off" {...register("newMail")} />
        <FieldError message={errors.newMail?.message} />
      </div>

      {result && !result.success && (
        <p role="alert" className="text-destructive text-xs">
          {result.error}
        </p>
      )}
      {result?.success && (
        <p role="status" className="text-sm">
          Verification link sent to <strong className="break-all">{result.mail}</strong> for{" "}
          <strong>{result.username}</strong>.
        </p>
      )}

      <Button type="submit" disabled={isPending} className="w-fit">
        {isPending ? "Sending…" : "Move account and send link"}
      </Button>
    </form>
  )
}
