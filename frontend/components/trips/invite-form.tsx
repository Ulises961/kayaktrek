"use client"

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { inviteUser } from "@/lib/trips/actions"
import { InviteUserSchema, type InviteUserFields } from "@/lib/dtos/trip"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

interface InviteFormProps {
  tripId: string
}

export function InviteForm({ tripId }: InviteFormProps) {
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<InviteUserFields>({
    resolver: zodResolver(InviteUserSchema),
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await inviteUser(tripId, data.email)
      if (result.success) {
        reset()
      } else {
        setError("email", { message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="Email address"
          disabled={isPending}
          {...register("email")}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
    </form>
  )
}
