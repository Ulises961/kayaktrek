import { Suspense } from "react"
import { LoginForm } from "./login-form-loader"

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
