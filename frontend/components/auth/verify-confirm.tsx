"use client"

import Link from "next/link"
import { useActionState } from "react"
import { verifyAccount } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { ctaButtonClass } from "@/components/common/button-roles"
import { cn } from "@/lib/utils"
import type { AuthResult } from "@/lib/auth/actions"

// On success `verifyAccount` redirects and never returns, so the only state this renders
// is the failure one: an expired or already-used link.
export function VerifyConfirm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState<AuthResult | null>(
    async () => verifyAccount(token),
    null,
  )

  return (
    <form action={formAction} className="contents">
      <Button type="submit" disabled={isPending} className={cn("w-full", ctaButtonClass)}>
        {isPending ? "Confirming…" : "Confirm my email"}
      </Button>

      {state?.success === false && (
        <>
          <p className="auth-notice auth-notice-error">{state.error}</p>
          <Link href="/login" className="auth-link text-[11px]">
            Back to sign in
          </Link>
        </>
      )}
    </form>
  )
}
