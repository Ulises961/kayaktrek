"use client"

import { useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { updateTrip } from "@/lib/trips/actions"
import {
  TRIP_DIFFICULTIES,
  TRIP_DIFFICULTY_LABELS,
  TripFieldsSchema,
  type Trip,
  type TripFields,
} from "@/lib/dtos/trip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/common/date-picker"

interface EditTripFormProps {
  trip: Trip
  onSuccess: () => void
  onCancel: () => void
}

export function EditTripForm({ trip, onSuccess, onCancel }: EditTripFormProps) {
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<TripFields>({
    resolver: zodResolver(TripFieldsSchema),
    defaultValues: {
      destination: trip.destination ?? "",
      description: trip.description ?? "",
      dateFrom: trip.dateFrom ?? "",
      dateTo: trip.dateTo ?? "",
      difficulty: trip.difficulty ?? null,
    },
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateTrip(trip.id!, {
        destination: data.destination?.trim() || undefined,
        description: data.description?.trim() || undefined,
        dateFrom: data.dateFrom || undefined,
        dateTo: data.dateTo || undefined,
        difficulty: data.difficulty ?? null,
      })
      if (result.success) {
        onSuccess()
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
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
          <Label>From</Label>
          <Controller
            name="dateFrom"
            control={control}
            render={({ field }) => (
              <DatePicker value={field.value} onChange={field.onChange} disabled={isPending} />
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>To</Label>
          <Controller
            name="dateTo"
            control={control}
            render={({ field }) => (
              <DatePicker value={field.value} onChange={field.onChange} disabled={isPending} />
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="difficulty">Difficulty</Label>
        <select
          id="difficulty"
          disabled={isPending}
          className="border-input bg-background focus:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:ring-1 focus:outline-none disabled:opacity-50"
          {...register("difficulty")}
        >
          <option value="">Not set</option>
          {TRIP_DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {TRIP_DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
      </div>

      {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
