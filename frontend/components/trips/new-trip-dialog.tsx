"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createTrip } from "@/lib/trips/actions"
import { TripFieldsSchema, type TripFields } from "@/lib/dtos/trip"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { AccentDialogContent } from "@/components/common/accent-dialog"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/common/date-picker"
import { KayakIcon, PlusIcon } from "lucide-react"

export function NewTripDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors },
  } = useForm<TripFields>({
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button className={ctaButtonClass}>
          <PlusIcon className="size-4" />
          New trip
        </Button>
      </DialogTrigger>
      <AccentDialogContent icon={KayakIcon} title="New trip">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Input placeholder="Destination" disabled={isPending} {...register("destination")} />
            {errors.destination && (
              <p className="text-destructive text-xs">{errors.destination.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Textarea
              placeholder="Description (optional)"
              rows={3}
              disabled={isPending}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-destructive text-xs">{errors.description.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateFrom">From</Label>
              <Controller
                name="dateFrom"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="dateFrom"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isPending}
                  />
                )}
              />
              {errors.dateFrom && (
                <p className="text-destructive text-xs">{errors.dateFrom.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateTo">To</Label>
              <Controller
                name="dateTo"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    id="dateTo"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={isPending}
                  />
                )}
              />
              {errors.dateTo && <p className="text-destructive text-xs">{errors.dateTo.message}</p>}
            </div>
          </div>
          {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </AccentDialogContent>
    </Dialog>
  )
}
