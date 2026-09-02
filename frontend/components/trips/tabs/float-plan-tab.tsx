"use client"

import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnchorIcon, PencilIcon, ShieldAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { FloatPlanMedicalTabSection } from "@/components/trips/float-plan-medical-tab-section"
import { MEDICAL_NOTES_ENABLED } from "@/lib/features"
import { FloatPlanFormSchema } from "@/lib/dtos/trip-member"
import { updateMyFloatPlan } from "@/lib/trip-member/actions"
import type { TripMember, FloatPlanFormValues } from "@/lib/dtos/trip-member"

interface FloatPlanTabProps {
  tripId: string
  currentMember: TripMember
  /** Current user's medical-notes reset flag — drives the re-entry prompt. */
  medicalNotesResetAt?: string | null
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold tracking-[0.06em] uppercase">
      {icon}
      {children}
    </p>
  )
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex min-w-0 flex-col gap-0.5 md:flex-row md:items-start md:gap-2">
      <span className="text-muted-foreground/70 md:text-muted-foreground text-[10px] leading-none font-semibold tracking-[0.06em] uppercase md:w-32 md:shrink-0 md:pt-px md:text-sm md:font-normal md:tracking-normal md:normal-case">
        {label}
      </span>
      <span className="text-foreground text-sm leading-snug break-words md:font-medium">
        {value}
      </span>
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

export function FloatPlanTab({ tripId, currentMember, medicalNotesResetAt }: FloatPlanTabProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isConfirmed, setIsConfirmed] = useState(!!currentMember.floatPlanConfirmedAt)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FloatPlanFormValues>({
    resolver: zodResolver(FloatPlanFormSchema),
    defaultValues: {
      vesselMake: currentMember.vesselMake ?? "",
      vesselModel: currentMember.vesselModel ?? "",
      vesselLengthCm:
        currentMember.vesselLengthCm != null ? String(currentMember.vesselLengthCm) : "",
      vesselColorPrimary: currentMember.vesselColorPrimary ?? "",
      vesselColorSecondary: currentMember.vesselColorSecondary ?? "",
      emergencyContactName: currentMember.emergencyContactName ?? "",
      emergencyContactPhone: currentMember.emergencyContactPhone ?? "",
      emergencyContactRelationship: currentMember.emergencyContactRelationship ?? "",
    },
  })

  function handleEdit() {
    setError(null)
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
      setIsConfirmed(true)
      setIsEditing(false)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {!isConfirmed && (
        <div className="border-notice-border bg-notice-bg text-notice-ink rounded-md border px-4 py-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Review your float plan for this trip and save it to confirm.
          </p>
        </div>
      )}

      {isEditing ? (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <SectionLabel icon={<AnchorIcon className="size-4" />}>Vessel</SectionLabel>
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
            <SectionLabel icon={<ShieldAlertIcon className="size-4" />}>
              Emergency contact
            </SectionLabel>
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
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel icon={<AnchorIcon className="size-4" />}>Vessel</SectionLabel>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEdit}
                className="h-6 shrink-0 px-2 text-xs"
              >
                <PencilIcon className="size-3" />
                Edit
              </Button>
            </div>
            <VesselReadOnly member={currentMember} />
          </div>
          <Separator />
          <div className="flex flex-col gap-3">
            <SectionLabel icon={<ShieldAlertIcon className="size-4" />}>
              Emergency contact
            </SectionLabel>
            <EmergencyReadOnly member={currentMember} />
          </div>
        </div>
      )}

      {MEDICAL_NOTES_ENABLED && (
        <>
          <Separator />

          <div className="flex flex-col gap-4">
            <SectionLabel icon={<ShieldAlertIcon className="size-4" />}>Medical notes</SectionLabel>
            <p className="text-muted-foreground -mt-2 text-xs">
              Private — visible only to the trip leader on the float plan.
            </p>
            <FloatPlanMedicalTabSection
              tripId={tripId}
              hasStoredNotes={!!currentMember.hasTripMedicalNotes}
              sharedAt={currentMember.medicalNotesConsentAt ?? null}
              profileResetAt={medicalNotesResetAt}
            />
          </div>
        </>
      )}
    </div>
  )
}
