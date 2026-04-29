import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import Link from "next/link"

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="flex flex-col gap-4 p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Invalid reset link</h1>
        <p className="text-sm text-slate-500">The reset link is missing or malformed.</p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-slate-900 underline underline-offset-2"
        >
          Request a new link
        </Link>
      </div>
    )
  }

  return <ResetPasswordForm token={token} />
}
