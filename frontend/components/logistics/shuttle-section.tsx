"use client"

import { useState } from "react"
import { CarIcon, MapPinIcon, PencilIcon, UserIcon, UsersIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { AddVehicleDialog } from "./add-vehicle-dialog"
import { EditVehicleDialog } from "./edit-vehicle-dialog"
import { DeleteVehicleButton } from "./delete-vehicle-button"
import { JoinVehicleButton, RemovePassengerButton } from "./passenger-actions"
import type { Logistics } from "@/lib/dtos/logistics"
import type { ShuttleVehicle } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"

interface ShuttleSectionProps {
  logistics: Logistics | null
  vehicles: ShuttleVehicle[]
  members: TripMember[]
  tripId?: string
  currentUserId?: string
  currentMemberId?: string
  leaderId?: string
  isMember?: boolean
}

// ── Capacity dots ─────────────────────────────────────────────────────────────

function CapacityDots({ total, filled, label }: { total: number | null | undefined; filled: number; label: string }) {
  if (!total) return null
  const capped = Math.min(filled, total)
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground w-12 shrink-0">
        {label}
      </span>
      <div className="flex gap-0.5">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`size-2 rounded-full ${i < capped ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{capped}/{total}</span>
    </div>
  )
}

// ── Vehicle card ──────────────────────────────────────────────────────────────

interface VehicleCardProps {
  vehicle: ShuttleVehicle
  members: TripMember[]
  tripId?: string
  currentUserId?: string
  currentMemberId?: string
  leaderId?: string
  alreadyAssigned: Set<string>
  onEdit: () => void
}

function VehicleCard({ vehicle, members, tripId, currentUserId, currentMemberId, leaderId, alreadyAssigned, onEdit }: VehicleCardProps) {
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]))

  const driverMember = vehicle.driverId ? memberById[vehicle.driverId] : null
  const driverName = driverMember
    ? [driverMember.user.name, driverMember.user.surname].filter(Boolean).join(" ")
    : vehicle.driverName ?? null

  const passengers = vehicle.passengers.map((p) => {
    const m = memberById[p.tripMemberId]
    return m ? { id: p.tripMemberId, name: [m.user.name, m.user.surname].filter(Boolean).join(" ") } : null
  }).filter(Boolean) as { id: string; name: string }[]

  const canManageVehicle = !!currentUserId && (
    (memberById[vehicle.arrangedById ?? ""]?.user.id === currentUserId) ||
    currentUserId === leaderId
  )

  const isArranger = !!currentMemberId && vehicle.arrangedById === currentMemberId
  const canJoin = !!currentMemberId && !alreadyAssigned.has(currentMemberId) && !isArranger && !!tripId && !!vehicle.id
  const canRemovePassenger = (passengerId: string) =>
    !!tripId && !!vehicle.id && (passengerId === currentMemberId || canManageVehicle)

  return (
    <div className="rounded-lg border border-border bg-card p-3 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CarIcon className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium">{vehicle.vehicleDescription ?? "Vehicle"}</span>
        </div>
        <div className="flex items-center gap-1">
          {vehicle.pickupPoint && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <MapPinIcon className="size-3" />
              {vehicle.pickupPoint}
            </span>
          )}
          {canManageVehicle && (
            <>
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onEdit}>
                <PencilIcon className="size-3.5" />
              </Button>
              {tripId && vehicle.id && (
                <DeleteVehicleButton
                  tripId={tripId}
                  vehicleId={vehicle.id}
                  vehicleDescription={vehicle.vehicleDescription}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground w-12 shrink-0">Driver</span>
        {driverName ? (
          <span className="text-sm">{driverName}</span>
        ) : (
          <span className="text-sm text-muted-foreground/60 italic">No driver set</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <CapacityDots total={vehicle.seatsAvailable} filled={passengers.length} label="Seats" />
        <CapacityDots total={vehicle.kayakSpots} filled={vehicle.kayakSpots ?? 0} label="Kayaks" />
      </div>

      {(passengers.length > 0 || canJoin) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Passengers</span>
          <div className="flex flex-wrap gap-1 items-center">
            {passengers.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                <UserIcon className="size-2.5" />
                {p.name}
                {canRemovePassenger(p.id) && tripId && vehicle.id && (
                  <RemovePassengerButton tripId={tripId} vehicleId={vehicle.id} memberId={p.id} />
                )}
              </span>
            ))}
            {canJoin && tripId && vehicle.id && currentMemberId && (
              <JoinVehicleButton tripId={tripId} vehicleId={vehicle.id} currentMemberId={currentMemberId} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ShuttleSection({ logistics, vehicles, members, tripId, currentUserId, currentMemberId, leaderId, isMember }: ShuttleSectionProps) {
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const editingVehicle = vehicles.find((v) => v.id === editingVehicleId) ?? null

  const passengerMemberIds = new Set(vehicles.flatMap((v) => v.passengers.map((p) => p.tripMemberId)))
  const unassigned = members.filter((m) => m.id && !passengerMemberIds.has(m.id))

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CarIcon className="size-4" />
              Shuttle
              {vehicles.length > 0 && (
                <span className="text-muted-foreground font-normal">({vehicles.length} {vehicles.length === 1 ? "vehicle" : "vehicles"})</span>
              )}
            </CardTitle>
            {isMember && tripId && <AddVehicleDialog tripId={tripId} members={members} />}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(logistics?.shuttleMeetingTime || logistics?.shuttleNotes) && (
            <div className="flex flex-col gap-2">
              {logistics.shuttleMeetingTime && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meet at</span>
                  <span className="text-sm font-medium tabular-nums">{logistics.shuttleMeetingTime}</span>
                </div>
              )}
              {logistics.shuttleNotes && (
                <p className="text-sm text-foreground/80 pl-3 border-l-2 border-border leading-relaxed">
                  {logistics.shuttleNotes}
                </p>
              )}
            </div>
          )}

          {vehicles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vehicles added yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {vehicles.map((v) => (
                <VehicleCard
                  key={v.id}
                  vehicle={v}
                  members={members}
                  tripId={tripId}
                  currentUserId={currentUserId}
                  currentMemberId={currentMemberId}
                  leaderId={leaderId}
                  alreadyAssigned={passengerMemberIds}
                  onEdit={() => setEditingVehicleId(v.id ?? null)}
                />
              ))}
            </div>
          )}

          {vehicles.length > 0 && unassigned.length > 0 && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <UsersIcon className="size-3.5 text-muted-foreground" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Not yet assigned ({unassigned.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {unassigned.map((m) => {
                    const name = [m.user.name, m.user.surname].filter(Boolean).join(" ")
                    return (
                      <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                        {name}
                      </span>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {editingVehicle && tripId && (
        <EditVehicleDialog
          tripId={tripId}
          vehicle={editingVehicle}
          members={members}
          open={!!editingVehicleId}
          onOpenChange={(o) => { if (!o) setEditingVehicleId(null) }}
        />
      )}
    </>
  )
}
