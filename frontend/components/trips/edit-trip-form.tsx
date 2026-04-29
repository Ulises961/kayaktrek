"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateTrip } from "@/lib/trips/actions"
import { TripFieldsSchema, type Trip, type TripFields } from "@/lib/dtos/trip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

export function EditTripForm({ trip }: { trip: Trip }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const { register, handleSubmit, setError, formState: { errors } } = useForm<TripFields>({
    resolver: zodResolver(TripFieldsSchema),
    defaultValues: {
      destination: trip.destination ?? "",
      description: trip.description ?? "",
      dateFrom: trip.dateFrom ?? "",
      dateTo: trip.dateTo ?? "",
    },
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateTrip(trip.id!, {
        destination: data.destination?.trim() || undefined,
        description: data.description?.trim() || undefined,
        dateFrom: data.dateFrom || undefined,
        dateTo: data.dateTo || undefined,
      })
      if (result.success) {
        router.push(`/trips/${trip.id}`)
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="destination">Destination</Label>
        <Input
          id="destination"
          placeholder="Where are you going?"
          disabled={isPending}
          {...register("destination")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          rows={4}
          placeholder="A few words about the trip (optional)"
          disabled={isPending}
          {...register("description")}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateFrom">From</Label>
          <Input id="dateFrom" type="date" disabled={isPending} {...register("dateFrom")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dateTo">To</Label>
          <Input id="dateTo" type="date" disabled={isPending} {...register("dateTo")} />
        </div>
      </div>

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push(`/trips/${trip.id}`)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
