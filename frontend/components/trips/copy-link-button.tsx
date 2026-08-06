"use client"

import { useState } from "react"
import { LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      // Clipboard access can be denied (insecure context, missing
      // permission) — leave the label unchanged rather than let the
      // rejection go unhandled (matches this app's other copy-link
      // affordances, which are similarly best-effort with no error UI).
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="print:hidden">
      <LinkIcon className="size-3.5" />
      {copied ? "Copied!" : "Copy link"}
    </Button>
  )
}
