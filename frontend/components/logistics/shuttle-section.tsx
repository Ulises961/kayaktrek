"use client"

import { useState } from "react"
import { CarIcon, MapPinIcon, PencilIcon, UserIcon, UsersIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { AddVehicleDialog } from "./add-vehicle-dialog"
import { EditVehicleDialog } from "./edit-vehicle-dialog"
import { DeleteVehicleButton } from "./delete-vehicle-button"
import { JoinVehicleButton, RemovePassengerButton } from "./passenger-actions"
import type { Logistics } from "@/lib/dtos/logistics"
import type { ShuttleVehicle } from "@/lib/dtos/shuttle-vehicle"
import type { TripMember } from "@/lib/dtos/trip-member"
import { EmptyState } from "@/components/common/empty-state"

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

function CapacityDots({
  total,
  filled,
  label,
}: {
  total: number | null | undefined
  filled: number
  label: string
}) {
  if (!total) return null
  const capped = Math.min(filled, total)
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground w-12 shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </span>
      <div className="flex gap-0.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`size-2 rounded-full ${i < capped ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>
      <span className="text-muted-foreground text-xs">
        {capped}/{total}
      </span>
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

function VehicleCard({
  vehicle,
  members,
  tripId,
  currentUserId,
  currentMemberId,
  leaderId,
  alreadyAssigned,
  onEdit,
}: VehicleCardProps) {
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]))

  const arrangerMember = vehicle.arrangedById ? memberById[vehicle.arrangedById] : null

  const driverMember = vehicle.driverId
    ? memberById[vehicle.driverId]
    : !vehicle.driverName
      ? arrangerMember
      : null

  const driverName = driverMember
    ? [driverMember.user.name, driverMember.user.surname].filter(Boolean).join(" ")
    : (vehicle.driverName ?? null)

  const passengers = vehicle.passengers
    .map((p) => {
      const m = memberById[p.tripMemberId]
      return m
        ? { id: p.tripMemberId, name: [m.user.name, m.user.surname].filter(Boolean).join(" ") }
        : null
    })
    .filter(Boolean) as { id: string; name: string }[]

  const canManageVehicle =
    !!currentUserId && (arrangerMember?.user.id === currentUserId || currentUserId === leaderId)

  const isArranger = !!currentMemberId && vehicle.arrangedById === currentMemberId
  const canJoin =
    !!currentMemberId &&
    !alreadyAssigned.has(currentMemberId) &&
    !isArranger &&
    !!tripId &&
    !!vehicle.id
  const canRemovePassenger = (passengerId: string) =>
    !!tripId && !!vehicle.id && (passengerId === currentMemberId || canManageVehicle)

  return (
    <div className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="bg-muted-foreground/25 w-0.5 shrink-0 self-stretch rounded-full" />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CarIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="text-sm font-medium">{vehicle.vehicleDescription ?? "Vehicle"}</span>
          </div>
          <div className="flex items-center gap-1">
            {vehicle.pickupPoint && (
              <span className="text-muted-foreground mr-1 flex items-center gap-1 text-xs">
                <MapPinIcon className="size-3" />
                {vehicle.pickupPoint}
              </span>
            )}
            {canManageVehicle && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground size-7"
                  onClick={onEdit}
                >
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
          <span className="text-muted-foreground w-12 shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase">
            Driver
          </span>
          {driverName ? (
            <span className="text-sm">{driverName}</span>
          ) : (
            <span className="text-muted-foreground text-sm italic">No driver set</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <CapacityDots total={vehicle.seatsAvailable} filled={passengers.length} label="Seats" />
          <CapacityDots total={vehicle.kayakSpots} filled={passengers.length} label="Kayaks" />
        </div>

        {(passengers.length > 0 || canJoin) && (
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
              Passengers
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {passengers.map((p) => (
                <span
                  key={p.id}
                  className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                >
                  <UserIcon className="size-2.5" />
                  {p.name}
                  {canRemovePassenger(p.id) && tripId && vehicle.id && (
                    <RemovePassengerButton tripId={tripId} vehicleId={vehicle.id} memberId={p.id} />
                  )}
                </span>
              ))}
              {canJoin && tripId && vehicle.id && currentMemberId && (
                <JoinVehicleButton
                  tripId={tripId}
                  vehicleId={vehicle.id}
                  currentMemberId={currentMemberId}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ShuttleSection({
  logistics,
  vehicles,
  members,
  tripId,
  currentUserId,
  currentMemberId,
  leaderId,
  isMember,
}: ShuttleSectionProps) {
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const editingVehicle = vehicles.find((v) => v.id === editingVehicleId) ?? null

  const passengerMemberIds = new Set(
    vehicles.flatMap((v) => v.passengers.map((p) => p.tripMemberId)),
  )
  const arrangerMemberIds = new Set(
    vehicles.map((v) => v.arrangedById).filter((id): id is string => !!id),
  )
  const unassigned = members.filter(
    (m) => m.id && !passengerMemberIds.has(m.id) && !arrangerMemberIds.has(m.id),
  )

  return (
    <>
      {isMember && tripId && (
        <div className="mb-3 flex justify-end">
          <AddVehicleDialog tripId={tripId} members={members} />
        </div>
      )}

      {(logistics?.shuttleMeetingTime || logistics?.shuttleNotes) && (
        <div className="mb-3 flex flex-col gap-2">
          {logistics.shuttleMeetingTime && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
                Meet at
              </span>
              <span className="text-sm font-medium tabular-nums">
                {logistics.shuttleMeetingTime}
              </span>
            </div>
          )}
          {logistics.shuttleNotes && (
            <p className="text-foreground/80 border-border border-l-2 pl-3 text-sm leading-relaxed">
              {logistics.shuttleNotes}
            </p>
          )}
        </div>
      )}

      {vehicles.length === 0 ? (
        <EmptyState
          icon={CarIcon}
          title="No vehicles yet"
          description="Cars used for the shuttle appear here, with who drives and how many seats and boats each takes."
          ghostRows={2}
        />
      ) : (
        <div className="divide-border divide-y">
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
          <Separator className="my-3" />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <UsersIcon className="text-muted-foreground size-3.5" />
              <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
                Not yet assigned ({unassigned.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {unassigned.map((m) => (
                <span
                  key={m.id}
                  className="border-border text-muted-foreground inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs"
                >
                  {[m.user.name, m.user.surname].filter(Boolean).join(" ")}
                </span>
              ))}
            </div>
          </div>
        </>
      )}

      {editingVehicle && tripId && (
        <EditVehicleDialog
          tripId={tripId}
          vehicle={editingVehicle}
          members={members}
          open={!!editingVehicleId}
          onOpenChange={(o) => {
            if (!o) setEditingVehicleId(null)
          }}
        />
      )}
    </>
  )
}
