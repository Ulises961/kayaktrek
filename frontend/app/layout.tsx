import type { Metadata } from "next"
import { headers } from "next/headers"
import { Geist_Mono, DM_Sans, Fraunces } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { siteOrigin } from "@/lib/seo/origin"

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
  // `template` appends the name to every page title, so a page sets only its own
  // subject and the brand lives here alone — the metadata counterpart to
  // `BrandLockup` owning the wordmark.
  title: {
    // Middle dot, not an em dash — same separator `BrandLockup`'s header subtitle
    // uses and for the same reason: "Sea-kayak" already carries a hyphen, so a
    // second dash-like mark beside it read as a stutter.
    default: "Kayaktrek · Sea-kayak expedition planner",
    template: "%s · Kayaktrek",
  },
  description: "Plan, crew, and navigate your sea-kayak expedition",
  // Relative image paths in the metadata below resolve against this, so a shared link
  // carries an absolute URL to the real origin rather than one relative to whatever page
  // was shared.
  metadataBase: siteOrigin(),
  // Without these a link preview has nothing to show and the scraper picks for itself —
  // usually the favicon, which is the bare compass mark and reads as no brand at all
  // beside the post. `app/opengraph-image.png` is the file-convention card (mark, wordmark
  // and the descriptor); Next emits its URL, dimensions and alt text from the file itself.
  openGraph: {
    type: "website",
    siteName: "Kayaktrek",
    title: "Kayaktrek · Sea-kayak expedition planner",
    description: "Plan, crew, and navigate your sea-kayak expedition",
    url: "/",
    locale: "en",
  },
  // X falls back to the OpenGraph image when no twitter-image is declared, so only the card
  // shape is set here — without it the same picture renders as a small square thumbnail.
  twitter: {
    card: "summary_large_image",
    title: "Kayaktrek · Sea-kayak expedition planner",
    description: "Plan, crew, and navigate your sea-kayak expedition",
  },
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
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
