"use client"

import dynamic from "next/dynamic"

// See login/login-form-loader.tsx — same fix, same reason.
export const CancelDeletionForm = dynamic(
  () => import("./cancel-deletion-form").then((m) => m.CancelDeletionForm),
  { ssr: false },
)
