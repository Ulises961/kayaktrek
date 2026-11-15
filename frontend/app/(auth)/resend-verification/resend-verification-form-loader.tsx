"use client"

import dynamic from "next/dynamic"

// See app/(auth)/login/login-form-loader.tsx — same fix, same reason.
export const ResendVerificationForm = dynamic(
  () => import("./resend-verification-form").then((m) => m.ResendVerificationForm),
  { ssr: false },
)
