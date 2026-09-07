"use client"

import dynamic from "next/dynamic"

// See app/(auth)/login/login-form-loader.tsx — same fix, same reason.
export const RegisterForm = dynamic(() => import("./register-form").then((m) => m.RegisterForm), {
  ssr: false,
})
