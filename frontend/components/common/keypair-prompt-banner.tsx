"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ShieldCheck } from "lucide-react"
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
import { reAuth, storeKeypair } from "@/lib/profile/actions"
import { generateKeypair } from "@/lib/crypto/medical"
import { MEDICAL_NOTES_ENABLED } from "@/lib/features"

const Schema = z.object({ password: z.string().min(1, "Password is required") })
type FormValues = z.infer<typeof Schema>

interface KeypairPromptBannerProps {
  hasKeypair: boolean
}

export function KeypairPromptBanner({ hasKeypair }: KeypairPromptBannerProps) {
  const [done, setDone] = useState(hasKeypair)
  const [open, setOpen] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(Schema) })

  // Nothing to nag about while medical notes are parked — this banner exists only to set
  // up the key that feature reads. Registration still generates a keypair silently, so
  // unparking prompts only the accounts that predate that.
  if (done || !MEDICAL_NOTES_ENABLED) return null

  // The keypair is generated here and the private half wrapped under the password before
  // anything is sent (M22). Re-auth is what proves to the server that this is the account
  // holder, since the password itself no longer travels.
  async function onSubmit(values: FormValues) {
    const authResult = await reAuth(values.password)
    if (!authResult.success) {
      setError("password", { message: authResult.error })
      return
    }

    const keypair = await generateKeypair(values.password)
    const result = await storeKeypair(authResult.elevatedToken, keypair)
    if (result.success) {
      setDone(true)
      setOpen(false)
      reset()
    } else {
      setError("password", { message: result.error })
    }
  }

  return (
    <>
      <div className="mx-6 mb-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          Set up medical note encryption so crew can share notes with you securely.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/60 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
          onClick={() => setOpen(true)}
        >
          Set up now
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set up encryption</DialogTitle>
            <DialogDescription>
              Enter your password once to generate your encryption keypair. Crew members can then
              share medical notes with you securely — only you can decrypt them.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="keypair-password">Password</Label>
              <PasswordInput
                id="keypair-password"
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
                  setOpen(false)
                  reset()
                }}
              >
                Later
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Setting up…" : "Set up"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
