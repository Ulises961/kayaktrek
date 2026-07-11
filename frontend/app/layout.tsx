import type { Metadata } from "next"
import { headers } from "next/headers"
import { Geist_Mono, DM_Sans, Fraunces } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/providers/theme-provider"

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  axes: ["opsz"],
})

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  style: ["normal", "italic"],
})

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "Kayak Expedition Planner",
  description: "Plan, crew, and navigate your kayak expedition",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading headers() here opts the whole app into dynamic rendering, which the CSP nonce
  // requires anyway (a nonce can't be baked into a statically generated page).
  const nonce = (await headers()).get("x-nonce") ?? undefined

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${fraunces.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
