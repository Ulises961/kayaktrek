import { ResetPasswordForm } from "@/components/auth/reset-password-form-loader"
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
        <p className="auth-footnote text-[11px]">The reset link is missing or malformed.</p>
        <Link href="/forgot-password" className="auth-link text-[11px]">
          Request a new link
        </Link>
      </AuthCard>
    )
  }

  return <ResetPasswordForm token={token} />
}
