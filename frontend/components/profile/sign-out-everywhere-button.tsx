"use client"

import { useTransition } from "react"
import { LogOutIcon } from "lucide-react"
import { logoutEverywhere } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"

export function SignOutEverywhereButton() {
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() => startTransition(() => logoutEverywhere())}
      className="self-start"
    >
      <LogOutIcon className="size-4" />
      {isPending ? "Signing out…" : "Sign out everywhere"}
    </Button>
  )
}
