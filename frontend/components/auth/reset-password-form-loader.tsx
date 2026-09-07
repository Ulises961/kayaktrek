"use client"

import dynamic from "next/dynamic"

// See app/(auth)/login/login-form-loader.tsx — same fix, same reason.
export const ResetPasswordForm = dynamic(
  () => import("./reset-password-form").then((m) => m.ResetPasswordForm),
  { ssr: false },
)
