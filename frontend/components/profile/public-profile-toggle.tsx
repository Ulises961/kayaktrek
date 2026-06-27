"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { setProfileVisibility } from "@/lib/profile/actions"
import { ExternalLinkIcon } from "lucide-react"

interface PublicProfileToggleProps {
  username: string
  initialIsPublic: boolean
}

export function PublicProfileToggle({ username, initialIsPublic }: PublicProfileToggleProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle(next: boolean) {
    setError(null)
    setIsPublic(next) // optimistic
    startTransition(async () => {
      const result = await setProfileVisibility(next)
      if (!result.success) {
        setIsPublic(!next) // revert
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="public-profile" className="text-sm font-medium">
            Public profile
          </Label>
          <p className="text-muted-foreground text-sm">
            Share a privacy-safe page — your name, bio, certifications and paddling stats. Never
            your contact details, vessel, emergency contact, or medical notes.
          </p>
        </div>
        <Switch
          id="public-profile"
          checked={isPublic}
          onCheckedChange={handleToggle}
          disabled={isPending}
        />
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {isPublic && (
        <Link
          href={`/paddlers/${username}`}
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm underline underline-offset-2"
        >
          <ExternalLinkIcon className="size-3.5" />
          View your public profile
        </Link>
      )}
    </div>
  )
}
