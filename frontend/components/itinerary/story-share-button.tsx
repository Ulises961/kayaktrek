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

type StoryShareDialogProps = {
  itinerary: Itinerary
  open: boolean
  onOpenChange: (open: boolean) => void
}

function buildStoryUrl(token: string): string {
  return `${window.location.origin}/story/${token}`
}

// Trip narrative share (M7d) — shows the unlisted story link for an itinerary and, when there
// is none, offers to create it. Making a story public is its own act, so opening this dialog
// never creates a link by itself. Controlled, so it can be opened from the itinerary card's
// button or from the trip's actions menu.
export function StoryShareDialog({ itinerary, open, onOpenChange }: StoryShareDialogProps) {
  const [token, setToken] = useState(itinerary.storyShareToken ?? null)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

  // Creates the first link, or replaces the existing one (which invalidates the old).
  function handleGenerate() {
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
      <Dialog open={open} onOpenChange={onOpenChange}>
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
            {token ? (
              <Button
                variant="ghost"
                onClick={() => setShowRegenerateConfirm(true)}
                disabled={isPending}
              >
                <RefreshCwIcon className="size-3.5" />
                Regenerate
              </Button>
            ) : (
              <Button onClick={handleGenerate} disabled={isPending}>
                {isPending ? "Creating…" : "Create link"}
              </Button>
            )}
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
            <Button onClick={handleGenerate} disabled={isPending}>
              {isPending ? "Regenerating…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// The itinerary card's trigger, sitting beside the public/private toggle: closely related
// sharing controls, one existing home.
export function StoryShareButton({ itinerary }: { itinerary: Itinerary }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
      >
        <Share2Icon className="size-3" />
        <span>Share story</span>
      </button>
      <StoryShareDialog itinerary={itinerary} open={open} onOpenChange={setOpen} />
    </>
  )
}
