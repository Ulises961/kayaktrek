import { Suspense } from "react"
import { CancelDeletionForm } from "./cancel-deletion-form-loader"
import { AuthCard, AuthCardHeading } from "@/components/auth/auth-card"

export default function CancelDeletionPage() {
  return (
    <AuthCard>
      <AuthCardHeading
        title="Cancel deletion"
        subtitle="Use the link from your email to restore your account."
      />
      <Suspense>
        <CancelDeletionForm />
      </Suspense>
    </AuthCard>
  )
}
