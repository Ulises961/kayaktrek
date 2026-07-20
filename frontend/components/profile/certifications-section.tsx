"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/common/password-input"
import { Label } from "@/components/ui/label"
import { ListRow } from "@/components/common/list-row"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { reAuth } from "@/lib/profile/actions"
import {
  addCertification,
  updateCertification,
  deleteCertification,
  listCertifications,
  type CertActionResult,
} from "@/lib/certifications/actions"
import { isCertExpired, isElevatedValid } from "@/lib/certifications/expiry"
import type { Certification, CertificationFields } from "@/lib/dtos/certification"
import { CertificationForm } from "./certification-form"
import { AwardIcon, PencilIcon, Trash2Icon, PlusIcon } from "lucide-react"

interface CertificationsSectionProps {
  initialCerts: Certification[]
}

// Elevated tokens last 5 minutes on the backend; refresh slightly early to avoid
// a race where the token expires mid-request.
const ELEVATED_TTL_MS = 4.5 * 60 * 1000

type FormMode = { kind: "closed" } | { kind: "add" } | { kind: "edit"; cert: Certification }

export function CertificationsSection({ initialCerts }: CertificationsSectionProps) {
  const [certs, setCerts] = useState<Certification[]>(initialCerts)
  const [form, setForm] = useState<FormMode>({ kind: "closed" })
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Cached elevated token + the action waiting on re-authentication.
  const [token, setToken] = useState<{ value: string; expiresAt: number } | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [authError, setAuthError] = useState<string | null>(null)
  const [pending, setPending] = useState<((t: string) => void) | null>(null)

  function validToken(): string | null {
    if (token && isElevatedValid(token.expiresAt)) return token.value
    return null
  }

  // Run an elevated action, prompting for the password first if no valid token is cached.
  function runElevated(action: (t: string) => void) {
    const t = validToken()
    if (t) {
      action(t)
      return
    }
    setPending(() => action)
    setAuthError(null)
    setPassword("")
    setAuthOpen(true)
  }

  function confirmAuth() {
    setAuthError(null)
    startTransition(async () => {
      const result = await reAuth(password)
      if (!result.success) {
        setAuthError(result.error)
        return
      }
      setToken({ value: result.elevatedToken, expiresAt: Date.now() + ELEVATED_TTL_MS })
      setAuthOpen(false)
      const action = pending
      setPending(null)
      action?.(result.elevatedToken)
    })
  }

  async function refresh() {
    const result = await listCertifications()
    if (result.success) setCerts(result.certifications)
  }

  function afterMutation(result: CertActionResult, onSuccess: () => void) {
    if (result.success) {
      onSuccess()
    } else {
      // A stale/expired token forces a fresh re-auth on the next attempt.
      if (result.error.includes("re-authenticate")) setToken(null)
      setFormError(result.error)
    }
  }

  function handleSubmit(fields: CertificationFields) {
    setFormError(null)
    runElevated((t) =>
      startTransition(async () => {
        const result =
          form.kind === "edit"
            ? await updateCertification(t, form.cert.id!, fields)
            : await addCertification(t, fields)
        afterMutation(result, async () => {
          await refresh()
          setForm({ kind: "closed" })
        })
      }),
    )
  }

  function handleDelete(cert: Certification) {
    setFormError(null)
    runElevated((t) =>
      startTransition(async () => {
        const result = await deleteCertification(t, cert.id!)
        afterMutation(result, () => setCerts((prev) => prev.filter((c) => c.id !== cert.id)))
      }),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {certs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No certifications yet. Add your awards and qualifications — they appear on your public
          profile if you choose to share it.
        </p>
      ) : (
        <ul className="flex flex-col">
          {certs.map((cert) => {
            const expired = isCertExpired(cert.validUntil)
            return (
              <ListRow key={cert.id} className="flex items-center gap-3 py-2 text-sm">
                <AwardIcon className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{cert.award}</p>
                  <p className="text-muted-foreground truncate text-xs">{cert.organization}</p>
                </div>
                {expired && (
                  <span className="rounded-[3px] border border-current bg-red-100 px-2 py-0.5 text-[10px] font-medium tracking-[0.06em] text-red-700 uppercase dark:bg-red-900/30 dark:text-red-400">
                    Expired
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Edit certification"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => {
                    setFormError(null)
                    setForm({ kind: "edit", cert })
                  }}
                >
                  <PencilIcon className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Delete certification"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  disabled={isPending}
                  onClick={() => handleDelete(cert)}
                >
                  <Trash2Icon className="size-4" />
                </button>
              </ListRow>
            )
          })}
        </ul>
      )}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setFormError(null)
            setForm({ kind: "add" })
          }}
        >
          <PlusIcon className="size-4" />
          Add certification
        </Button>
      </div>

      {/* Add / edit form */}
      <Dialog
        open={form.kind !== "closed"}
        onOpenChange={(open) => !open && setForm({ kind: "closed" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form.kind === "edit" ? "Edit certification" : "Add certification"}
            </DialogTitle>
            <DialogDescription>
              Self-asserted qualifications. These are a badge on your profile — they don&apos;t
              affect endorsements.
            </DialogDescription>
          </DialogHeader>
          {form.kind !== "closed" && (
            <CertificationForm
              cert={form.kind === "edit" ? form.cert : undefined}
              onSubmit={handleSubmit}
              onCancel={() => setForm({ kind: "closed" })}
              isPending={isPending}
              error={formError}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Re-authentication prompt (elevated token) */}
      <Dialog open={authOpen} onOpenChange={(open) => !open && setAuthOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm your password</DialogTitle>
            <DialogDescription>
              Editing certifications requires re-authentication for your security.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cert-reauth-password">Password</Label>
              <PasswordInput
                id="cert-reauth-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password) confirmAuth()
                }}
                disabled={isPending}
                autoComplete="current-password"
                autoFocus
              />
            </div>
            {authError && <p className="text-destructive text-xs">{authError}</p>}
            <div className="flex gap-3">
              <Button type="button" onClick={confirmAuth} disabled={isPending || !password}>
                {isPending ? "Verifying…" : "Continue"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setAuthOpen(false)
                  setPending(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
