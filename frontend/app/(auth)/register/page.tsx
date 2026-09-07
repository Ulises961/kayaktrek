import { getRegistrationStatus } from "@/lib/auth/actions"
import { RegisterForm } from "./register-form-loader"

export default async function RegisterPage() {
  const { inviteCodeRequired } = await getRegistrationStatus()
  return <RegisterForm inviteCodeRequired={inviteCodeRequired} />
}
