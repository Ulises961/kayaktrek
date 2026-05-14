"use client"

import { useState } from "react"
import { LinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(window.location.href)
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
