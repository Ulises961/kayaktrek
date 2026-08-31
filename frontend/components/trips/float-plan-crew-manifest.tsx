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
import { reAuth, getKeypair } from "@/lib/profile/actions"
import { decrypt, decryptAsRecipient } from "@/lib/crypto/medical"
import type { TripMember } from "@/lib/dtos/trip-member"
import { formatDayDate } from "@/lib/utils/date"
import { formatVesselLength, formatPaddlerName } from "@/lib/user/format"

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    // Stacked at base, side by side from sm. `w-36` is 9rem against a 112.5% root, so the
    // label reserves 162px — most of the ~275px a 320px viewport leaves once the shell and
    // this section's padding are taken out, which is not enough for a vessel make and model
    // beside it. `min-w-0` + `break-words` on the value because an email address has no
    // break opportunity and would otherwise set the row's width itself.
    <div className="flex flex-col gap-0.5 text-base sm:flex-row sm:gap-2">
      <span className="text-muted-foreground sm:w-36 sm:shrink-0">{label}</span>
      <span className="min-w-0 font-medium break-words">{value}</span>
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
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <UserIcon className="text-muted-foreground mt-1.5 size-4 shrink-0" />
          {/* Name and address stack at base and sit on one line from sm. An email has no
              break opportunity, so beside a name and a role pill at 320 it is the element
              that decides the row's width. */}
          <div className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-2">
            <span className="text-lg font-semibold">{fullName}</span>
            {member.user.mail && (
              <span className="text-muted-foreground min-w-0 text-sm break-words">
                {member.user.mail}
              </span>
            )}
          </div>
        </div>
        <span className="text-muted-foreground bg-muted shrink-0 rounded px-2 py-0.5 text-xs font-semibold tracking-widest uppercase">
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
  // The leader's own private key, unwrapped once on this device and held in memory only
  // (M22). Every crew note on the page decrypts against it, so the 600,000-iteration key
  // derivation is paid once per unlock rather than once per member. The password is kept
  // alongside it because each fetch re-authenticates for a fresh elevated token, which is
  // deliberately short-lived.
  const [leaderPassword, setLeaderPassword] = useState<string | null>(null)
  const [leaderPrivateKey, setLeaderPrivateKey] = useState<string | null>(null)
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

  /**
   * Fetch one member's sealed notes and decrypt them here. Re-auth is per fetch because an
   * elevated token is short-lived and the leader may sit on this page reading several
   * members; the private key is not, because unwrapping it is the expensive step.
   */
  async function fetchNotes(memberId: string, password: string, privateKey: string) {
    setLoadingMembers((prev) => new Set(prev).add(memberId))
    setMemberErrors((prev) => {
      const next = { ...prev }
      delete next[memberId]
      return next
    })

    const failWith = (message: string) => {
      setLoadingMembers((prev) => {
        const next = new Set(prev)
        next.delete(memberId)
        return next
      })
      setMemberErrors((prev) => ({ ...prev, [memberId]: message }))
    }

    const authResult = await reAuth(password)
    if (!authResult.success) return failWith(authResult.error)

    const result = await readMemberMedicalNotes(tripId, memberId, authResult.elevatedToken)
    if (!result.success) return failWith(result.error)

    let plaintext: string
    try {
      plaintext = decryptAsRecipient(
        result.sealed.ciphertext,
        result.sealed.nonce,
        result.sealed.ephemeralKey,
        privateKey,
      )
    } catch {
      // The member sealed these to a public key that is not the one this private key
      // matches — leadership changed after they shared, and their copy was never re-sealed.
      return failWith("These notes were shared with a previous leader. Ask them to share again.")
    }

    setLoadingMembers((prev) => {
      const next = new Set(prev)
      next.delete(memberId)
      return next
    })
    setNotesCache((prev) => ({ ...prev, [memberId]: plaintext }))
  }

  async function handleView(memberId: string) {
    if (leaderPrivateKey) {
      await fetchNotes(memberId, leaderPassword!, leaderPrivateKey)
    } else {
      setPendingMemberId(memberId)
      setDialogOpen(true)
    }
  }

  async function onPasswordSubmit(values: PasswordFormValues) {
    if (!pendingMemberId) return

    const authResult = await reAuth(values.password)
    if (!authResult.success) {
      setError("password", { message: authResult.error })
      return
    }

    const keypairResult = await getKeypair(authResult.elevatedToken)
    if (!keypairResult.success) {
      setError("password", { message: keypairResult.error })
      return
    }

    let privateKey: string
    try {
      const { privateKeyCiphertext, privateKeyNonce, privateKeySalt } = keypairResult.keypair
      privateKey = await decrypt(
        privateKeyCiphertext,
        privateKeyNonce,
        privateKeySalt,
        values.password,
      )
    } catch {
      // reAuth accepted this password, so the key was wrapped under an older one — a
      // password change from before M22 re-wrapped it client-side.
      setError("password", {
        message:
          "Your encryption key does not match this password. Change your password to reset it.",
      })
      return
    }

    setLeaderPassword(values.password)
    setLeaderPrivateKey(privateKey)
    setDialogOpen(false)
    setPendingMemberId(null)
    reset()
    await fetchNotes(pendingMemberId, values.password, privateKey)
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
