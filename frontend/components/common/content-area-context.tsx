"use client"
import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"

// How the content area distributes horizontal space. The shell owns this, not
// the pages, so no page can cap its own width and drift from the rest.
//
// - "column" — the default. A width-capped column against the left margin; the
//   cap is about line length, not layout, and left-aligning keeps the page title
//   at the same x in every mode.
// - "wide"   — full width, still padded. For pages whose content genuinely uses
//   the horizontal axis: the explore map/results split.
// - "bleed"  — full width, no padding, positioned. For a map that IS the page.
export type ContentLayout = "column" | "wide" | "bleed"

type ContentAreaContextValue = {
  layout: ContentLayout
  setLayout: (value: ContentLayout) => void
}

const ContentAreaContext = createContext<ContentAreaContextValue | null>(null)

export function ContentAreaProvider({ children }: { children: ReactNode }) {
  const [layout, setLayout] = useState<ContentLayout>("column")
  return (
    <ContentAreaContext.Provider value={{ layout, setLayout }}>
      {children}
    </ContentAreaContext.Provider>
  )
}

export function useContentArea() {
  const context = useContext(ContentAreaContext)
  if (!context) {
    throw new Error("useContentArea must be used within a ContentAreaProvider.")
  }
  return context
}
