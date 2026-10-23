"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnchorIcon, CheckIcon, PencilIcon, ShieldAlertIcon } from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { FloatPlanInReachSection } from "@/components/trips/float-plan-inreach-section"
import { FloatPlanMedicalTabSection } from "@/components/trips/float-plan-medical-tab-section"
import { FloatPlanSafetySection } from "@/components/trips/float-plan-safety-section"
import { MEDICAL_NOTES_ENABLED } from "@/lib/features"
import { canShareSatellitePosition } from "@/lib/trips/satellite"
import { formatDayDate } from "@/lib/utils/date"
import type { Logistics } from "@/lib/dtos/logistics"
import type { TripState } from "@/lib/dtos/trip"
import { FloatPlanFormSchema } from "@/lib/dtos/trip-member"
import { updateMyFloatPlan } from "@/lib/trip-member/actions"
import type { TripMember, FloatPlanFormValues } from "@/lib/dtos/trip-member"

interface FloatPlanTabProps {
  tripId: string
  tripState: TripState | null | undefined
  currentMember: TripMember
  /** Whether the user has a satellite feed registered in Settings (M29). */
  hasSatelliteFeed: boolean
  /** The leader also manages the shore contact and the share link, and prints the plan. */
  isLeader: boolean
  /** The trip's logistics record, which holds the shore contact and share link. Leader only. */
  logistics: Logistics | null
  /** Current user's medical-notes reset flag — drives the re-entry prompt. */
  medicalNotesResetAt?: string | null
}

// Rows of the accordion that start open. The safety section is not here: it is done once
// before departure, so it starts folded. A value with no row is ignored.
const OPEN_BY_DEFAULT = ["details", "inreach", "medical"]

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium">{children}</h3>
}

// Label above value, always: the details sit in half-width columns, where a fixed-width
// label beside a value leaves the value a few characters wide.
function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-foreground text-sm leading-snug font-medium break-words">{value}</span>
    </div>
  )
}

function VesselReadOnly({ member }: { member: TripMember }) {
  const { vesselMake, vesselModel, vesselLengthCm, vesselColorPrimary, vesselColorSecondary } =
    member
  const hasAny = vesselMake || vesselModel || vesselLengthCm || vesselColorPrimary
  if (!hasAny)
    return <p className="text-muted-foreground text-sm italic">No vessel info recorded.</p>
  const colors = [vesselColorPrimary, vesselColorSecondary].filter(Boolean).join(" / ")
  return (
    <div className="flex flex-col gap-1.5">
      <FieldRow
        label="Make / Model"
        value={[vesselMake, vesselModel].filter(Boolean).join(" ") || null}
      />
      <FieldRow
        label="Length (cm)"
        value={vesselLengthCm != null ? String(vesselLengthCm) : null}
      />
      <FieldRow label="Colour" value={colors || null} />
    </div>
  )
}

function EmergencyReadOnly({ member }: { member: TripMember }) {
  const { emergencyContactName, emergencyContactPhone, emergencyContactRelationship } = member
  const hasAny = emergencyContactName || emergencyContactPhone
  if (!hasAny)
    return <p className="text-muted-foreground text-sm italic">No emergency contact recorded.</p>
  return (
    <div className="flex flex-col gap-1.5">
      <FieldRow label="Name" value={emergencyContactName} />
      <FieldRow label="Relationship" value={emergencyContactRelationship} />
      <FieldRow label="Phone" value={emergencyContactPhone} />
    </div>
  )
}

function floatPlanFormValues(member: TripMember): FloatPlanFormValues {
  return {
    vesselMake: member.vesselMake ?? "",
    vesselModel: member.vesselModel ?? "",
    vesselLengthCm: member.vesselLengthCm != null ? String(member.vesselLengthCm) : "",
    vesselColorPrimary: member.vesselColorPrimary ?? "",
    vesselColorSecondary: member.vesselColorSecondary ?? "",
    emergencyContactName: member.emergencyContactName ?? "",
    emergencyContactPhone: member.emergencyContactPhone ?? "",
    emergencyContactRelationship: member.emergencyContactRelationship ?? "",
  }
}

export function FloatPlanTab({
  tripId,
  tripState,
  currentMember,
  hasSatelliteFeed,
  isLeader,
  logistics,
  medicalNotesResetAt,
}: FloatPlanTabProps) {
  const canShareSatelliteFeed = canShareSatellitePosition(tripState, currentMember)
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // Confirmed from this tab, or already confirmed on the server — the second is how a
  // confirmation made on the user's other device arrives (M36), so it must not be frozen
  // at the value the page loaded with.
  const [confirmedHere, setConfirmedHere] = useState(false)
  const isConfirmed = confirmedHere || !!currentMember.floatPlanConfirmedAt
  // A plan confirmed in this session has no date yet: it arrives with the next refresh.
  const confirmedLabel = currentMember.floatPlanConfirmedAt
    ? `Confirmed ${formatDayDate(currentMember.floatPlanConfirmedAt)}`
    : "Confirmed"

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FloatPlanFormValues>({
    resolver: zodResolver(FloatPlanFormSchema),
    defaultValues: floatPlanFormValues(currentMember),
  })

  function handleEdit() {
    setError(null)
    // The form's defaults were taken when the page loaded. If the same member changed
    // their float plan on another device since, opening the form on those would silently
    // save over the newer values — start from what the server has now.
    reset(floatPlanFormValues(currentMember))
    setIsEditing(true)
  }

  function handleCancel() {
    reset()
    setError(null)
    setIsEditing(false)
  }

  function onSubmit(values: FloatPlanFormValues) {
    setError(null)
    startTransition(async () => {
      const result = await updateMyFloatPlan(tripId, values)
      if (!result.success) {
        setError(result.error)
        return
      }
      setConfirmedHere(true)
      setIsEditing(false)
    })
  }

  return (
    <Accordion type="multiple" defaultValue={OPEN_BY_DEFAULT}>
      {isLeader && <FloatPlanSafetySection tripId={tripId} logistics={logistics} />}

      <AccordionItem value="details">
        <AccordionTrigger className="text-sm font-medium hover:no-underline">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <AnchorIcon className="text-muted-foreground size-3.5 shrink-0" />
            Your details
            {isConfirmed && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs font-normal">
                <CheckIcon className="size-3" />
                {confirmedLabel}
              </span>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4">
          {!isConfirmed && (
            <div className="border-notice-border bg-notice-bg text-notice-ink rounded-md border px-3 py-2">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Review your float plan for this trip and save it to confirm.
              </p>
            </div>
          )}

          {isEditing ? (
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
              <div className="flex flex-col gap-4">
                <SubHeading>Vessel</SubHeading>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpVesselMake">Make</Label>
                    <Input
                      id="fpVesselMake"
                      placeholder="e.g. Wilderness Systems"
                      disabled={isPending}
                      {...register("vesselMake")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpVesselModel">Model</Label>
                    <Input
                      id="fpVesselModel"
                      placeholder="e.g. Tempest 170"
                      disabled={isPending}
                      {...register("vesselModel")}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpVesselLength">Length (cm)</Label>
                    <Input
                      id="fpVesselLength"
                      type="number"
                      min={1}
                      disabled={isPending}
                      {...register("vesselLengthCm")}
                    />
                    {errors.vesselLengthCm && (
                      <p className="text-destructive text-xs">{errors.vesselLengthCm.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpColorPrimary">Primary colour</Label>
                    <Input
                      id="fpColorPrimary"
                      placeholder="e.g. Red"
                      disabled={isPending}
                      {...register("vesselColorPrimary")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpColorSecondary">Secondary colour</Label>
                    <Input
                      id="fpColorSecondary"
                      placeholder="e.g. White"
                      disabled={isPending}
                      {...register("vesselColorSecondary")}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-4">
                <SubHeading>Emergency contact</SubHeading>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpEmergencyName">Name</Label>
                    <Input
                      id="fpEmergencyName"
                      disabled={isPending}
                      {...register("emergencyContactName")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="fpEmergencyRelationship">Relationship</Label>
                    <Input
                      id="fpEmergencyRelationship"
                      placeholder="e.g. Partner"
                      disabled={isPending}
                      {...register("emergencyContactRelationship")}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fpEmergencyPhone">Phone</Label>
                  <Input
                    id="fpEmergencyPhone"
                    type="tel"
                    disabled={isPending}
                    {...register("emergencyContactPhone")}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving…" : "Save float plan"}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel} disabled={isPending}>
                  Cancel
                </Button>
                {error && <p className="text-destructive text-xs">{error}</p>}
              </div>
            </form>
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="grid min-w-0 flex-1 gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2.5">
                  <SubHeading>Vessel</SubHeading>
                  <VesselReadOnly member={currentMember} />
                </div>
                <div className="flex flex-col gap-2.5">
                  <SubHeading>Emergency contact</SubHeading>
                  <EmergencyReadOnly member={currentMember} />
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleEdit} className="shrink-0">
                <PencilIcon className="size-3.5" />
                Edit
              </Button>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      {canShareSatelliteFeed && (
        <FloatPlanInReachSection
          tripId={tripId}
          tripState={tripState}
          currentMember={currentMember}
          hasSatelliteFeed={hasSatelliteFeed}
        />
      )}

      {MEDICAL_NOTES_ENABLED && (
        <AccordionItem value="medical">
          <AccordionTrigger className="text-sm font-medium hover:no-underline">
            <span className="flex items-center gap-2">
              <ShieldAlertIcon className="text-muted-foreground size-3.5 shrink-0" />
              Medical notes
            </span>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-4">
            <p className="text-muted-foreground text-xs">
              Private — visible only to the trip leader on the float plan.
            </p>
            <FloatPlanMedicalTabSection
              tripId={tripId}
              hasStoredNotes={!!currentMember.hasTripMedicalNotes}
              sharedAt={currentMember.medicalNotesConsentAt ?? null}
              profileResetAt={medicalNotesResetAt}
            />
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  )
}
