"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ShuttleVehicleFieldsSchema, type ShuttleVehicleFields } from "@/lib/dtos/shuttle-vehicle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DialogFooter } from "@/components/ui/dialog"
import { FieldLabel, FieldError, NativeSelect } from "@/components/common/form-field"
import type { TripMember } from "@/lib/dtos/trip-member"

export type VehicleFormProps = {
  members: TripMember[]
  submitLabel?: string
  isPending?: boolean
  error?: string | null
  // Prefill for editing an existing vehicle; omitted for a fresh create.
  values?: ShuttleVehicleFields
  onSubmit: (fields: ShuttleVehicleFields) => void
}

function driverToggleClass(active: boolean) {
  return `flex-1 px-3 py-1.5 transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "bg-background text-muted-foreground hover:bg-muted"
  }`
}

export function VehicleForm({
  members,
  submitLabel = "Save",
  isPending = false,
  error = null,
  values,
  onSubmit,
}: VehicleFormProps) {
  const [externalDriver, setExternalDriver] = useState(!values?.driverId && !!values?.driverName)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ShuttleVehicleFields>({
    resolver: zodResolver(ShuttleVehicleFieldsSchema),
    values,
  })

  const submit = handleSubmit((data) => {
    if (externalDriver) {
      data.driverId = null
    } else {
      data.driverName = undefined
      data.driverContact = undefined
    }
    onSubmit(data)
  })

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {/* `col-span-1` at base is load-bearing, not noise: a child spanning 2 columns
          in a 1-column grid makes CSS add an implicit second one, and implicit
          columns are `auto`-sized rather than `1fr`. Seats and Kayak spots then sat
          side by side at 320px with Seats squeezed to nothing by the number input's
          max-content width. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="col-span-1 flex flex-col gap-1.5 sm:col-span-2">
          <FieldLabel htmlFor="vehicleDescription">Vehicle description</FieldLabel>
          <Input
            id="vehicleDescription"
            placeholder="Vehicle description"
            disabled={isPending}
            {...register("vehicleDescription")}
          />
          <FieldError message={errors.vehicleDescription?.message} />
        </div>
        <div className="col-span-1 flex flex-col gap-1.5 sm:col-span-2">
          <FieldLabel htmlFor="pickupPoint">Pickup point</FieldLabel>
          <Input
            id="pickupPoint"
            placeholder="Where will the vehicle pick people up?"
            disabled={isPending}
            {...register("pickupPoint")}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="seatsAvailable">Seats available</FieldLabel>
          <Input
            id="seatsAvailable"
            type="number"
            min={0}
            placeholder="0"
            disabled={isPending}
            {...register("seatsAvailable", {
              setValueAs: (v: string) => (v === "" || v == null ? undefined : parseInt(v, 10)),
            })}
          />
          <FieldError message={errors.seatsAvailable?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="kayakSpots">Kayak spots</FieldLabel>
          <Input
            id="kayakSpots"
            type="number"
            min={0}
            placeholder="0"
            disabled={isPending}
            {...register("kayakSpots", {
              setValueAs: (v: string) => (v === "" || v == null ? undefined : parseInt(v, 10)),
            })}
          />
          <FieldError message={errors.kayakSpots?.message} />
        </div>
      </div>

      {/* Driver toggle */}
      <div className="flex flex-col gap-2">
        <FieldLabel>Driver</FieldLabel>
        <div className="border-input flex overflow-hidden rounded-md border text-sm">
          <button
            type="button"
            onClick={() => {
              setExternalDriver(false)
              setValue("driverName", undefined)
              setValue("driverContact", undefined)
            }}
            className={driverToggleClass(!externalDriver)}
          >
            Trip member
          </button>
          <button
            type="button"
            onClick={() => {
              setExternalDriver(true)
              setValue("driverId", null)
            }}
            className={driverToggleClass(externalDriver)}
          >
            External
          </button>
        </div>

        {!externalDriver ? (
          <NativeSelect
            disabled={isPending}
            defaultValue={values?.driverId ?? ""}
            onChange={(e) => setValue("driverId", e.target.value || null)}
          >
            <option value="">No driver selected</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {[m.user.name, m.user.surname].filter(Boolean).join(" ")}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input placeholder="Driver name" disabled={isPending} {...register("driverName")} />
            <Input
              placeholder="Driver contact"
              disabled={isPending}
              {...register("driverContact")}
            />
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
