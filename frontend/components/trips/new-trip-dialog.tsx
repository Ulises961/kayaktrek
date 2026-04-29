"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createTrip } from "@/lib/trips/actions"
import { TripFieldsSchema, type TripFields } from "@/lib/dtos/trip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { PlusIcon } from "lucide-react"

export function NewTripDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<TripFields>({
    resolver: zodResolver(TripFieldsSchema),
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await createTrip({
        destination: data.destination?.trim() || undefined,
        description: data.description?.trim() || undefined,
        dateFrom: data.dateFrom || undefined,
        dateTo: data.dateTo || undefined,
      })
      if (result.success) {
        setOpen(false)
        reset()
        router.push(`/trips/${result.tripId}`)
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" />
          New trip
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New trip</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Input placeholder="Destination" disabled={isPending} {...register("destination")} />
            {errors.destination && <p className="text-xs text-destructive">{errors.destination.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Textarea placeholder="Description (optional)" rows={3} disabled={isPending} {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateFrom">From</Label>
              <Input id="dateFrom" type="date" disabled={isPending} {...register("dateFrom")} />
              {errors.dateFrom && <p className="text-xs text-destructive">{errors.dateFrom.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateTo">To</Label>
              <Input id="dateTo" type="date" disabled={isPending} {...register("dateTo")} />
              {errors.dateTo && <p className="text-xs text-destructive">{errors.dateTo.message}</p>}
            </div>
          </div>
          {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
