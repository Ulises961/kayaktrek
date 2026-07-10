"use client"

import { Fragment, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnchorIcon, CalendarIcon, PencilIcon, UsersIcon, XIcon } from "lucide-react"
import {
  TRIP_DIFFICULTIES,
  TRIP_STATE,
  TRIP_STATES,
  TRIP_STATE_LABELS,
  TripFieldsSchema,
  type Trip,
  type TripFields,
  type TripState,
} from "@/lib/dtos/trip"
import { updateTrip } from "@/lib/trips/actions"
import { daysBetween } from "@/lib/trips/format"
import { formatDayDate } from "@/lib/utils/date"
import { StateBadge } from "@/components/common/state-badge"
import { fieldLabelClass } from "@/components/common/form-field"
import { cn } from "@/lib/utils"
import { AdvanceStateButton } from "@/components/trips/advance-state-button"
import { DeleteTripButton } from "@/components/trips/delete-trip-button"
import { DatePicker } from "@/components/common/date-picker"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Card, CardContent } from "@/components/ui/card"

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  moderate: "Moderate",
  demanding: "Demanding",
  expert: "Expert",
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "text-green-600 dark:text-green-400",
  moderate: "text-amber-600 dark:text-amber-400",
  demanding: "text-orange-600 dark:text-orange-400",
  expert: "text-red-600 dark:text-red-400",
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className={cn(fieldLabelClass, "sm:text-[12px]")}>{children}</span>
}

function StateTimeline({ currentState }: { currentState: TripState }) {
  const currentIndex = TRIP_STATES.indexOf(currentState)
  return (
    <div className="flex items-start">
      {TRIP_STATES.map((s, i) => (
        <Fragment key={s}>
          <div className="flex shrink-0 flex-col items-center gap-1.5">
            <div
              className={`size-3.5 rounded-full border-2 transition-colors ${
                i === currentIndex
                  ? "bg-primary border-primary"
                  : i < currentIndex
                    ? "bg-primary/30 border-primary/30"
                    : "bg-background border-border"
              }`}
            />
            <span
              className={`text-[10px] leading-none capitalize ${
                i === currentIndex ? "text-foreground font-semibold" : "text-muted-foreground"
              }`}
            >
              {TRIP_STATE_LABELS[s]}
            </span>
          </div>
          {i < TRIP_STATES.length - 1 && (
            <div
              className={`mt-[5px] h-0 min-w-4 flex-1 border-t border-dashed ${
                i < currentIndex ? "border-primary/40" : "border-border"
              }`}
            />
          )}
        </Fragment>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface TripIdentityCardProps {
  trip: Trip
  isLeader: boolean
}

export function TripIdentityCard({ trip, isLeader }: TripIdentityCardProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  const travellers = trip.travellers ?? []
  const days = trip.dateFrom && trip.dateTo ? daysBetween(trip.dateFrom, trip.dateTo) : null

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
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

  function handleCancel() {
    setIsEditing(false)
    reset({
      destination: trip.destination ?? "",
      description: trip.description ?? "",
      dateFrom: trip.dateFrom ?? "",
      dateTo: trip.dateTo ?? "",
      difficulty: trip.difficulty ?? null,
    })
  }

  const onSave = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateTrip(trip.id!, {
        destination: data.destination?.trim() || undefined,
        description: data.description?.trim() || undefined,
        dateFrom: data.dateFrom || undefined,
        dateTo: data.dateTo || undefined,
        difficulty: data.difficulty ?? null,
      })
      if (result.success) {
        setIsEditing(false)
        router.refresh()
      } else {
        setError("root", { message: result.error })
      }
    })
  })

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        {/* ── Title row ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          {isEditing ? (
            <Input
              placeholder="Destination"
              disabled={isPending}
              className="text-lg font-semibold"
              {...register("destination")}
            />
          ) : (
            <h1 className="text-2xl leading-tight font-semibold">
              {trip.destination ?? "Untitled trip"}
            </h1>
          )}
          <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
            {trip.state && <StateBadge state={trip.state} className="hidden sm:inline-flex" />}
            {isLeader && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit trip"
                className="text-muted-foreground size-7"
                onClick={() => (isEditing ? handleCancel() : setIsEditing(true))}
              >
                {isEditing ? <XIcon className="size-3.5" /> : <PencilIcon className="size-3.5" />}
              </Button>
            )}
          </div>
        </div>

        {/* ── Metadata grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-y-7 sm:grid-cols-2 sm:gap-x-20 sm:gap-y-5">
          {/* Dates */}
          <div className="flex flex-col gap-4">
            <FieldLabel>
              <CalendarIcon className="-mt-px mr-0.5 inline size-3" /> Dates{" "}
              {days !== null && (
                <span className="text-muted-foreground ml-1.5 text-xs">({days} days)</span>
              )}
            </FieldLabel>
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 sm:gap-5">
                  <span className="text-muted-foreground w-5 shrink-0 text-xs">From</span>
                  <div className="min-w-0 flex-1">
                    <Controller
                      name="dateFrom"
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isPending}
                        />
                      )}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-5">
                  <span className="text-muted-foreground w-5 shrink-0 text-xs">To</span>
                  <div className="min-w-0 flex-1">
                    <Controller
                      name="dateTo"
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                          disabled={isPending}
                        />
                      )}
                    />
                  </div>
                </div>
                {errors.dateTo && (
                  <p className="text-destructive text-xs">{errors.dateTo.message}</p>
                )}
              </div>
            ) : trip.dateFrom && trip.dateTo ? (
              <div className="flex flex-col gap-4 text-sm">
                <div className="flex items-baseline gap-4">
                  <span className="text-muted-foreground w-6 shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase sm:text-[12px]">
                    From
                  </span>
                  <span>{formatDayDate(trip.dateFrom)}</span>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-muted-foreground w-6 shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase sm:text-[12px]">
                    To
                  </span>
                  <span>{formatDayDate(trip.dateTo)}</span>
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground text-sm italic">Not set</span>
            )}
          </div>

          {/* Difficulty + Crew stacked */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">
              <FieldLabel>Difficulty</FieldLabel>
              {isEditing ? (
                <select
                  disabled={isPending}
                  className="border-input bg-background focus:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:ring-1 focus:outline-none disabled:opacity-50"
                  {...register("difficulty")}
                >
                  <option value="">Not set</option>
                  {TRIP_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>
                      {DIFFICULTY_LABELS[d]}
                    </option>
                  ))}
                </select>
              ) : trip.difficulty ? (
                <span className={`text-sm ${DIFFICULTY_COLORS[trip.difficulty]}`}>
                  {DIFFICULTY_LABELS[trip.difficulty]}
                </span>
              ) : (
                <span className="text-muted-foreground text-sm italic">Not set</span>
              )}
            </div>

            <div className="flex flex-row gap-1.5">
              <FieldLabel>
                <UsersIcon className="-mt-px mr-0.5 inline size-4" /> Crew ({travellers.length})
              </FieldLabel>
            </div>
          </div>
        </div>

        {/* ── Description ───────────────────────────────────────────────────── */}
        {(trip.description || isEditing) && (
          <>
            <Separator />
            <div className="flex flex-col gap-4">
              <FieldLabel>Description</FieldLabel>
              {isEditing ? (
                <Textarea
                  rows={3}
                  placeholder="A few words about the trip (optional)"
                  disabled={isPending}
                  {...register("description")}
                />
              ) : (
                <p className="text-foreground/80 text-xs leading-relaxed sm:text-sm">
                  {trip.description}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Save / cancel ─────────────────────────────────────────────────── */}
        {isEditing && (
          <div className="flex items-center gap-4">
            <Button size="sm" onClick={onSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isPending}>
              Cancel
            </Button>
            {errors.root && <p className="text-destructive text-sm">{errors.root.message}</p>}
          </div>
        )}

        {/* ── Leader sections ───────────────────────────────────────────────── */}
        {isLeader && (
          <>
            {/* Trip progression */}
            {trip.state && trip.state !== TRIP_STATE.PAST && (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <FieldLabel>Trip progression</FieldLabel>
                  <div className="pt-4 pb-3">
                    <StateTimeline currentState={trip.state} />
                  </div>
                  <AdvanceStateButton tripId={trip.id!} currentState={trip.state} />
                </div>
              </>
            )}

            {/* Float plan */}
            <Separator />
            <div className="flex flex-col gap-2">
              <FieldLabel>Float plan</FieldLabel>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="w-full sm:w-auto sm:self-start"
                >
                  <Link href={`/trips/${trip.id}/float-plan`}>
                    <AnchorIcon className="size-3.5" />
                    View float plan
                  </Link>
                </Button>
              </div>
            </div>

            {/* Delete */}
            <Separator />
            <div className="flex flex-col gap-4">
              <FieldLabel>Danger zone</FieldLabel>
              <div>
                <DeleteTripButton tripId={trip.id!} destination={trip.destination} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
