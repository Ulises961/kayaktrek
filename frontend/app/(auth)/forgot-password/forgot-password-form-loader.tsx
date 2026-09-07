"use client"

import dynamic from "next/dynamic"

// See app/(auth)/login/login-form-loader.tsx — same fix, same reason.
export const ForgotPasswordForm = dynamic(
  () => import("./forgot-password-form").then((m) => m.ForgotPasswordForm),
  { ssr: false },
)
