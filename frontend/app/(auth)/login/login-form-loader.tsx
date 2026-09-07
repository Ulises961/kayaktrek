"use client"

import dynamic from "next/dynamic"

// Browser password managers / autofill extensions mutate the email and password inputs'
// attributes before React hydrates, which mismatches the server-rendered markup — the
// symptom this used to paper over with `suppressHydrationWarning` on every affected field.
// Rendering the form client-only removes the server-rendered markup those extensions could
// mutate in the first place, so there's nothing left to mismatch.
export const LoginForm = dynamic(() => import("./login-form").then((m) => m.LoginForm), {
  ssr: false,
})
