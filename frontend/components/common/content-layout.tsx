"use client"
import { useContentLayout } from "@/hooks/use-content-layout"
import type { ContentLayout as Layout } from "./content-area-context"

// Declarative layout opt-out for pages whose content uses the horizontal axis.
// Renders nothing — it exists so a server-component page can set the layout
// without its content component having to reach into the shell, which would
// make that component un-renderable in a test without the provider.
export function ContentLayout({ layout }: { layout: Layout }) {
  useContentLayout(layout)
  return null
}
