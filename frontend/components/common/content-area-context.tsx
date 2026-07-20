"use client"
import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"

type ContentAreaContextValue = {
  fullBleed: boolean
  setFullBleed: (value: boolean) => void
}

const ContentAreaContext = createContext<ContentAreaContextValue | null>(null)

export function ContentAreaProvider({ children }: { children: ReactNode }) {
  const [fullBleed, setFullBleed] = useState(false)
  return (
    <ContentAreaContext.Provider value={{ fullBleed, setFullBleed }}>
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
