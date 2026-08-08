"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { UserIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PasswordInput } from "@/components/common/password-input"
import { Label } from "@/components/ui/label"
import { MedicalNotesViewer } from "@/components/trips/medical-notes-viewer"
import { readMemberMedicalNotes } from "@/lib/trip-member/actions"
import type { TripMember } from "@/lib/dtos/trip-member"
import { formatDayDate } from "@/lib/utils/date"
import { formatVesselLength, formatPaddlerName } from "@/lib/user/format"

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-base">
      <span className="text-muted-foreground w-36 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function VesselBlock({ member }: { member: TripMember }) {
  const { vesselMake, vesselModel, vesselLengthCm, vesselColorPrimary, vesselColorSecondary } =
    member
  if (!vesselMake && !vesselModel && !vesselLengthCm && !vesselColorPrimary)
    return <p className="text-muted-foreground text-base italic">No vessel info recorded.</p>
  const colors = [vesselColorPrimary, vesselColorSecondary].filter(Boolean).join(" / ")
  return (
    <div className="flex flex-col gap-1">
      <FieldRow
        label="Make / Model"
        value={[vesselMake, vesselModel].filter(Boolean).join(" ") || null}
      />
      <FieldRow label="Length" value={formatVesselLength(vesselLengthCm)} />
      <FieldRow label="Colour" value={colors || null} />
    </div>
  )
}

function EmergencyBlock({ member }: { member: TripMember }) {
  const { emergencyContactName, emergencyContactPhone, emergencyContactRelationship } = member
  if (!emergencyContactName && !emergencyContactPhone)
    return <p className="text-muted-foreground text-base italic">No emergency contact recorded.</p>
  return (
    <div className="flex flex-col gap-1">
      <FieldRow label="Name" value={emergencyContactName} />
      <FieldRow label="Relationship" value={emergencyContactRelationship} />
      <FieldRow label="Phone" value={emergencyContactPhone} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Password dialog schema
// ---------------------------------------------------------------------------

const PasswordSchema = z.object({ password: z.string().min(1, "Password is required") })
type PasswordFormValues = z.infer<typeof PasswordSchema>

// ---------------------------------------------------------------------------
// Member card — receives notes from parent cache
// ---------------------------------------------------------------------------

interface MemberCardProps {
  member: TripMember
  notes: string | null
  loading: boolean
  notesError: string | null
  onView: (memberId: string) => void
}

function MemberCard({ member, notes, loading, notesError, onView }: MemberCardProps) {
  const fullName = formatPaddlerName(member.user)
  const memberId = member.user.id ?? ""

  return (
    <div className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserIcon className="text-muted-foreground size-4 shrink-0" />
          <span className="text-lg font-semibold">{fullName}</span>
          {member.user.mail && (
            <span className="text-muted-foreground text-sm">{member.user.mail}</span>
          )}
        </div>
        <span className="text-muted-foreground bg-muted rounded px-2 py-0.5 text-xs font-semibold tracking-widest uppercase">
          {member.role}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
            Vessel
          </p>
          <VesselBlock member={member} />
        </div>
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
            Emergency Contact
          </p>
          <EmergencyBlock member={member} />
        </div>
      </div>

      <div>
        <p className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
          Medical Notes
        </p>
        <MedicalNotesViewer
          hasLeaderMedicalNotes={member.hasLeaderMedicalNotes ?? false}
          notes={notes}
          loading={loading}
          error={notesError}
          onView={() => onView(memberId)}
        />
      </div>

      {member.floatPlanConfirmedAt ? (
        <p className="text-muted-foreground text-xs">
          Float plan confirmed {formatDayDate(member.floatPlanConfirmedAt)}
        </p>
      ) : (
        <span className="self-start rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold tracking-[0.08em] text-amber-700 uppercase dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-400">
          Not confirmed
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export — owns password state, notes cache, dialog
// ---------------------------------------------------------------------------

interface FloatPlanCrewManifestProps {
  crew: TripMember[]
  tripId: string
}

export function FloatPlanCrewManifest({ crew, tripId }: FloatPlanCrewManifestProps) {
  const [leaderPassword, setLeaderPassword] = useState<string | null>(null)
  const [notesCache, setNotesCache] = useState<Record<string, string>>({})
  const [loadingMembers, setLoadingMembers] = useState<Set<string>>(new Set())
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({})
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pendingMemberId, setPendingMemberId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(PasswordSchema) })

  async function fetchNotes(memberId: string, password: string) {
    setLoadingMembers((prev) => new Set(prev).add(memberId))
    setMemberErrors((prev) => {
      const next = { ...prev }
      delete next[memberId]
      return next
    })
    const result = await readMemberMedicalNotes(tripId, memberId, password)
    setLoadingMembers((prev) => {
      const next = new Set(prev)
      next.delete(memberId)
      return next
    })
    if (result.success) {
      setNotesCache((prev) => ({ ...prev, [memberId]: result.medicalNotes }))
    } else {
      setMemberErrors((prev) => ({ ...prev, [memberId]: result.error }))
    }
  }

  async function handleView(memberId: string) {
    if (leaderPassword) {
      await fetchNotes(memberId, leaderPassword)
    } else {
      setPendingMemberId(memberId)
      setDialogOpen(true)
    }
  }

  async function onPasswordSubmit(values: PasswordFormValues) {
    if (!pendingMemberId) return
    const result = await readMemberMedicalNotes(tripId, pendingMemberId, values.password)
    if (result.success) {
      setLeaderPassword(values.password)
      setNotesCache((prev) => ({ ...prev, [pendingMemberId]: result.medicalNotes }))
      setDialogOpen(false)
      setPendingMemberId(null)
      reset()
    } else {
      setError("password", { message: result.error })
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {crew.map((member) => {
          const memberId = member.user.id ?? ""
          return (
            <MemberCard
              key={member.id ?? memberId}
              member={member}
              notes={notesCache[memberId] ?? null}
              loading={loadingMembers.has(memberId)}
              notesError={memberErrors[memberId] ?? null}
              onView={handleView}
            />
          )
        })}
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false)
            reset()
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Enter your password</DialogTitle>
            <DialogDescription>
              Your password is needed to decrypt the crew member&apos;s medical notes. It will be
              cached for this session so you only enter it once.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit(onPasswordSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="leader-password">Password</Label>
              <PasswordInput
                id="leader-password"
                autoComplete="current-password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-destructive text-sm">{errors.password.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDialogOpen(false)
                  reset()
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Decrypting…" : "View notes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
