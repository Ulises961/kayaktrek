import { API_URL, API_PREFIX } from "@/lib/api/config"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export default async function VerifyEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <AuthCard>
        <AuthCardHeading title="Confirmation failed" />
        <p className="auth-footnote text-[11px]">Missing confirmation token.</p>
      </AuthCard>
    )
  }

  let success = false
  let errorMessage = "This confirmation link is invalid or has expired."

  try {
    const res = await fetch(
      `${API_URL}${API_PREFIX}/auth/verify-email-change?token=${encodeURIComponent(token)}`,
      {
        cache: "no-store",
      },
    )
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
        <AuthCardHeading
          title="Email updated"
          subtitle="Your new email address is now active. Sign in again to continue."
        />
        <Link href="/login" className="auth-link text-[11px]">
          Sign in
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthCardHeading title="Confirmation failed" />
      <p className="auth-notice auth-notice-error">{errorMessage}</p>
      <Link href="/login" className="auth-link text-[11px]">
        Back to sign in
      </Link>
    </AuthCard>
  )
}
