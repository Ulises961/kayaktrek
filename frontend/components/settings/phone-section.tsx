"use client"

import { useState, useTransition } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { setPhone } from "@/lib/profile/actions"

interface PhoneSectionProps {
  initialPhone: string | null | undefined
}

// Phone lives in Settings, not signup (M12 §F) — collected once in an
// account-details context so float plans and future flows can prefill it
// without ever re-asking. Clearing the field removes the stored number.
export function PhoneSection({ initialPhone }: PhoneSectionProps) {
  const [value, setValue] = useState(initialPhone ?? "")
  const [saved, setSaved] = useState(initialPhone ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const dirty = value.trim() !== saved.trim()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await setPhone(value)
      if (result.success) {
        setSaved(value)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <Label htmlFor="phone">Phone number</Label>
      <div className="flex items-center gap-2">
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+34600000000"
          className="max-w-60"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isPending}
        />
        {dirty && (
          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Optional — international format. Leave empty to remove it.
      </p>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </form>
  )
}
