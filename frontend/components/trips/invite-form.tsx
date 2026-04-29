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

  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<InviteUserFields>({
    resolver: zodResolver(InviteUserSchema),
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await inviteUser(tripId, data.userId)
      if (result.success) {
        reset()
      } else {
        setError("userId", { message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input placeholder="User ID" disabled={isPending} {...register("userId")} />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Inviting…" : "Invite"}
        </Button>
      </div>
      {errors.userId && <p className="text-sm text-destructive">{errors.userId.message}</p>}
    </form>
  )
}
