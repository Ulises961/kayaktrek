"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LogFieldsSchema, type LogFields, type Log } from "@/lib/dtos/log"
import { createLog, updateLog } from "@/lib/logs/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { DatePicker } from "@/components/common/date-picker"

interface LogFormProps {
  log?: Log
}

export function LogForm({ log }: LogFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!log?.id

  const { register, handleSubmit, setError, control, formState: { errors } } = useForm<LogFields>({
    resolver: zodResolver(LogFieldsSchema),
    defaultValues: {
      date: log?.date ?? "",
      hours: log?.hours ?? undefined,
      avgSea: log?.avgSea ?? undefined,
      distance: log?.distance ?? undefined,
      notes: log?.notes ?? "",
    },
  })

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const fields: LogFields = {
        date: data.date || undefined,
        hours: data.hours,
        avgSea: data.avgSea,
        distance: data.distance,
        notes: data.notes?.trim() || undefined,
      }

      const result = isEdit
        ? await updateLog(log.id!, fields)
        : await createLog(fields)

      if (result.success) {
        router.push("/logs")
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5 max-w-lg">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="date">Date</Label>
        <Controller
          name="date"
          control={control}
          render={({ field }) => (
            <DatePicker
              id="date"
              value={field.value as string | undefined}
              onChange={field.onChange}
              disabled={isPending}
            />
          )}
        />
        {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hours">Hours paddled</Label>
          <Input
            id="hours"
            type="number"
            step="0.5"
            min={0}
            max={24}
            placeholder="0–24"
            disabled={isPending}
            {...register("hours", { valueAsNumber: true })}
          />
          {errors.hours && <p className="text-sm text-destructive">{errors.hours.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="distance">Distance (km)</Label>
          <Input
            id="distance"
            type="number"
            step="0.1"
            min={0}
            placeholder="km"
            disabled={isPending}
            {...register("distance", { valueAsNumber: true })}
          />
          {errors.distance && <p className="text-sm text-destructive">{errors.distance.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avgSea">Sea state — Beaufort (0–12)</Label>
        <Input
          id="avgSea"
          type="number"
          step="1"
          min={0}
          max={12}
          placeholder="0 = calm · 12 = hurricane"
          disabled={isPending}
          {...register("avgSea", { valueAsNumber: true })}
        />
        {errors.avgSea && <p className="text-sm text-destructive">{errors.avgSea.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={4}
          placeholder="Conditions, highlights, anything worth remembering"
          disabled={isPending}
          {...register("notes")}
        />
        {errors.notes && <p className="text-sm text-destructive">{errors.notes.message}</p>}
      </div>

      {errors.root && <p className="text-sm text-destructive">{errors.root.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : isEdit ? "Save changes" : "Add log"}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={() => router.push("/logs")}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
