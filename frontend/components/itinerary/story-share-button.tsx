"use client"

import { useState, useTransition } from "react"
import { CheckIcon, LinkIcon, RefreshCwIcon, Share2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { generateStoryShare } from "@/lib/itinerary/actions"
import type { Itinerary } from "@/lib/dtos/itinerary"

type StoryShareButtonProps = {
  itinerary: Itinerary
}

function buildStoryUrl(token: string): string {
  return `${window.location.origin}/story/${token}`
}

// Trip narrative share (M7d) — generates/shows the unlisted story link for an
// itinerary. Sits alongside the public/private toggle in ItineraryCard's action
// row: closely related sharing controls, one existing home.
export function StoryShareButton({ itinerary }: StoryShareButtonProps) {
  const [token, setToken] = useState(itinerary.storyShareToken ?? null)
  const [open, setOpen] = useState(false)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpen(e: React.MouseEvent) {
    e.preventDefault()
    setError(null)
    if (token) {
      setOpen(true)
      return
    }
    startTransition(async () => {
      const result = await generateStoryShare(itinerary.id ?? "")
      if (result.success) {
        setToken(result.itinerary.storyShareToken ?? null)
      } else {
        setError(result.error)
      }
      // Open either way — on failure this is what surfaces the error message.
      setOpen(true)
    })
  }

  async function handleCopy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(buildStoryUrl(token))
    } catch {
      // Clipboard access can be denied (insecure context, missing permission) —
      // leave the label unchanged rather than let the rejection go unhandled
      // (matches copy-link-button.tsx's same best-effort, no-error-UI pattern).
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleRegenerate() {
    setShowRegenerateConfirm(false)
    setError(null)
    startTransition(async () => {
      const result = await generateStoryShare(itinerary.id ?? "")
      if (result.success) {
        setToken(result.itinerary.storyShareToken ?? null)
        setCopied(false)
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={isPending}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors disabled:opacity-50"
      >
        <Share2Icon className="size-3" />
        <span>{isPending ? "Generating…" : "Share story"}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share trip story</DialogTitle>
            <DialogDescription>
              Anyone with this link can view the route and any photos you&apos;ve made public — no
              account required.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive text-sm">{error}</p>}
          {token && (
            <div className="bg-muted overflow-x-auto rounded-md border px-3 py-2 font-mono text-sm">
              {buildStoryUrl(token)}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCopy} disabled={!token}>
              {copied ? <CheckIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
              {copied ? "Copied!" : "Copy link"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowRegenerateConfirm(true)}
              disabled={isPending}
            >
              <RefreshCwIcon className="size-3.5" />
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRegenerateConfirm} onOpenChange={setShowRegenerateConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate story link?</DialogTitle>
            <DialogDescription>
              This invalidates the previous link — anyone who has it will no longer be able to view
              the story.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerateConfirm(false)}>
              Cancel
            </Button>
            <Button onClick={handleRegenerate} disabled={isPending}>
              {isPending ? "Regenerating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
