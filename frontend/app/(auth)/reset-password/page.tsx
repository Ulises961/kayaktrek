import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import Link from "next/link"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <AuthCard>
        <AuthCardHeading title="Invalid reset link" />
        <p className="text-[11px] text-[oklch(0.52_0.065_240)]">
          The reset link is missing or malformed.
        </p>
        <Link href="/forgot-password" className="auth-link text-[11px]">
          Request a new link
        </Link>
      </AuthCard>
    )
  }

  return <ResetPasswordForm token={token} />
}
