export type Size = "sm" | "md" | "lg"

export type Variant = "default" | "secondary" | "outline" | "ghost" | "destructive"

export interface Crumb {
  label: string
  href?: string
}

export interface HomeIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}
