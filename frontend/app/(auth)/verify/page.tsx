import Link from "next/link"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"
import { VerifyConfirm } from "@/components/auth/verify-confirm"

// M25 §3. This page used to verify on render and then offer a link to /login, which made
// the funnel from a blog post four steps and two credential entries. It now asks for one
// deliberate click, and that click both activates the account and signs the person in.
//
// Verification stays behind that click rather than happening on render: a mail scanner or
// link-preview fetcher that follows the emailed URL would otherwise burn the token before
// the recipient ever clicks, and the recipient would meet "invalid or expired".
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
        <p className="auth-notice auth-notice-error">
          This link is missing its verification token. Check that you copied the whole address from
          the email.
        </p>
        <Link href="/login" className="auth-link text-[11px]">
          Back to sign in
        </Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthCardHeading
        title="Confirm your email"
        subtitle="One tap and you are in — no password needed."
      />
      <VerifyConfirm token={token} />
    </AuthCard>
  )
}
