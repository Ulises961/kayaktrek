"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CarIcon, PlusIcon } from "lucide-react"
import { createShuttleVehicle } from "@/lib/shuttle/actions"
import { ShuttleVehicleFieldsSchema, type ShuttleVehicleFields } from "@/lib/dtos/shuttle-vehicle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface AddVehicleDialogProps {
  tripId: string
  members: TripMember[]
}

export function AddVehicleDialog({ tripId, members }: AddVehicleDialogProps) {
  const [open, setOpen] = useState(false)
  const [externalDriver, setExternalDriver] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = useForm<ShuttleVehicleFields>({
    resolver: zodResolver(ShuttleVehicleFieldsSchema),
  })

  function handleOpen(v: boolean) {
    setOpen(v)
    if (!v) {
      reset()
      setExternalDriver(false)
    }
  }

  const onSubmit = handleSubmit((data) => {
    if (externalDriver) {
      data.driverId = null
    } else {
      data.driverName = undefined
      data.driverContact = undefined
    }
    startTransition(async () => {
      const result = await createShuttleVehicle(tripId, data)
      if (result.success) {
        setOpen(false)
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full sm:w-auto">
          <PlusIcon className="size-3.5" />
          Add vehicle
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <div className="h-1 w-full bg-[#2272b6]" />
        <div className="p-6">
          <DialogHeader className="mb-5">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CarIcon className="size-4 text-[#2272b6]" />
              Add vehicle
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <FieldLabel htmlFor="vehicleDescription">Vehicle description</FieldLabel>
                <Input
                  id="vehicleDescription"
                  placeholder="Vehicle description"
                  disabled={isPending}
                  {...register("vehicleDescription")}
                />
                {errors.vehicleDescription && (
                  <p className="text-destructive text-xs">{errors.vehicleDescription.message}</p>
                )}
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
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
                    setValueAs: (v: string) =>
                      v === "" || v == null ? undefined : parseInt(v, 10),
                  })}
                />
                {errors.seatsAvailable && (
                  <p className="text-destructive text-xs">{errors.seatsAvailable.message}</p>
                )}
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
                    setValueAs: (v: string) =>
                      v === "" || v == null ? undefined : parseInt(v, 10),
                  })}
                />
                {errors.kayakSpots && (
                  <p className="text-destructive text-xs">{errors.kayakSpots.message}</p>
                )}
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
                  onChange={(e) => setValue("driverId", e.target.value || null)}
                  defaultValue=""
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
                Add
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
