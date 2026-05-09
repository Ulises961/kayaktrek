import { API_URL } from "@/lib/api/config"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <AuthCard>
        <AuthCardHeading title="Verification failed" />
        <p className="text-[11px] text-[oklch(0.52_0.065_240)]">Missing verification token.</p>
      </AuthCard>
    )
  }

  let success = false
  let errorMessage = "Invalid or expired verification link."

  try {
    const res = await fetch(`${API_URL}/api/auth/verify?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
    if (res.ok) {
      success = true
    } else {
      const data = await res.json().catch(() => ({}))
      errorMessage = data.description || errorMessage
    }
  } catch {
    errorMessage = "Could not reach the server. Please try again later."
  }

  if (success) {
    return (
      <AuthCard>
        <AuthCardHeading title="Email verified" subtitle="Your account is now active." />
        <Link href="/login" className="auth-link text-[11px]">Sign in</Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthCardHeading title="Verification failed" />
      <p className="auth-notice auth-notice-error">{errorMessage}</p>
      <Link href="/login" className="auth-link text-[11px]">Back to sign in</Link>
    </AuthCard>
  )
}
