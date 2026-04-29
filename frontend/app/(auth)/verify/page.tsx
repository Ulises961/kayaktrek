import { API_URL } from "@/lib/api/config"
import Link from "next/link"

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return (
      <div className="flex flex-col gap-4 p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Verification failed</h1>
        <p className="text-sm text-slate-500">Missing verification token.</p>
      </div>
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
      <div className="flex flex-col gap-4 p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Email verified</h1>
        <p className="text-sm text-slate-500">Your account is now active.</p>
        <Link
          href="/login"
          className="text-sm font-medium text-slate-900 underline underline-offset-2"
        >
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-8 bg-white rounded-xl shadow-sm border border-slate-200 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Verification failed</h1>
      <p className="text-sm text-slate-500">{errorMessage}</p>
      <Link
        href="/login"
        className="text-sm font-medium text-slate-900 underline underline-offset-2"
      >
        Back to sign in
      </Link>
    </div>
  )
}
