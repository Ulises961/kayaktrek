"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CarIcon } from "lucide-react"
import { updateShuttleVehicle } from "@/lib/shuttle/actions"
import {
  ShuttleVehicleFieldsSchema,
  type ShuttleVehicleFields,
  type ShuttleVehicle,
} from "@/lib/dtos/shuttle-vehicle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import type { TripMember } from "@/lib/dtos/trip-member"

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase"
    >
      {children}
    </Label>
  )
}

interface EditVehicleDialogProps {
  tripId: string
  vehicle: ShuttleVehicle
  members: TripMember[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditVehicleDialog({
  tripId,
  vehicle,
  members,
  open,
  onOpenChange,
}: EditVehicleDialogProps) {
  const [externalDriver, setExternalDriver] = useState(!vehicle.driverId && !!vehicle.driverName)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ShuttleVehicleFields>({
    resolver: zodResolver(ShuttleVehicleFieldsSchema),
    values: {
      driverId: vehicle.driverId,
      driverName: vehicle.driverName ?? "",
      driverContact: vehicle.driverContact ?? "",
      seatsAvailable: vehicle.seatsAvailable,
      kayakSpots: vehicle.kayakSpots,
      vehicleDescription: vehicle.vehicleDescription ?? "",
      pickupPoint: vehicle.pickupPoint ?? "",
    },
  })

  const onSubmit = handleSubmit((data) => {
    if (externalDriver) {
      data.driverId = null
    } else {
      data.driverName = undefined
      data.driverContact = undefined
    }
    startTransition(async () => {
      const result = await updateShuttleVehicle(tripId, vehicle.id!, data)
      if (result.success) {
        onOpenChange(false)
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className="h-1 w-full bg-[#2272b6]" />
        <div className="p-6">
          <DialogHeader className="mb-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CarIcon className="size-4 text-[#2272b6]" />
              Edit vehicle
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="vehicleDescription">Vehicle description</FieldLabel>
              <Input
                id="vehicleDescription"
                placeholder="Vehicle description"
                disabled={isPending}
                {...register("vehicleDescription")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor="pickupPoint">Pickup point</FieldLabel>
              <Input
                id="pickupPoint"
                placeholder="Where will the vehicle pick people up?"
                disabled={isPending}
                {...register("pickupPoint")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="seatsAvailable">Seats available</FieldLabel>
                <Input
                  id="seatsAvailable"
                  type="number"
                  min={0}
                  disabled={isPending}
                  {...register("seatsAvailable", {
                    setValueAs: (v: string) =>
                      v === "" || v == null ? undefined : parseInt(v, 10),
                  })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel htmlFor="kayakSpots">Kayak spots</FieldLabel>
                <Input
                  id="kayakSpots"
                  type="number"
                  min={0}
                  disabled={isPending}
                  {...register("kayakSpots", {
                    setValueAs: (v: string) =>
                      v === "" || v == null ? undefined : parseInt(v, 10),
                  })}
                />
              </div>
            </div>

            {/* Driver toggle */}
            <div className="flex flex-col gap-2">
              <FieldLabel>Driver</FieldLabel>
              <div className="border-input flex overflow-hidden rounded-md border text-sm">
                <button
                  type="button"
                  onClick={() => setExternalDriver(false)}
                  className={`flex-1 px-3 py-1.5 transition-colors ${!externalDriver ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  Trip member
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExternalDriver(true)
                    setValue("driverId", null)
                  }}
                  className={`flex-1 px-3 py-1.5 transition-colors ${externalDriver ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                >
                  External
                </button>
              </div>
              {!externalDriver ? (
                <select
                  className={SELECT_CLASS}
                  disabled={isPending}
                  defaultValue={vehicle.driverId ?? ""}
                  onChange={(e) => setValue("driverId", e.target.value || null)}
                >
                  <option value="">No driver selected</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {[m.user.name, m.user.surname].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Driver name"
                    disabled={isPending}
                    {...register("driverName")}
                  />
                  <Input
                    placeholder="Driver contact"
                    disabled={isPending}
                    {...register("driverContact")}
                  />
                </div>
              )}
            </div>

            {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}

            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
