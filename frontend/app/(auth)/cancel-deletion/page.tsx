import { Suspense } from "react"
import { CancelDeletionForm } from "./cancel-deletion-form"

export default function CancelDeletionPage() {
  return (
    <div className="flex flex-col gap-6 p-8 bg-white rounded-xl shadow-sm border border-slate-200 max-w-sm w-full">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cancel account deletion</h1>
        <p className="text-sm text-slate-500 mt-1">
          Use the link from your email to restore your account.
        </p>
      </div>
      <Suspense>
        <CancelDeletionForm />
      </Suspense>
    </div>
  )
}
