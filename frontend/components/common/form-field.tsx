"use client"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/**
 * Shared form-field primitives for the app's compact dialog/panel forms.
 * One source for the micro-label, inline error, and native-select styling
 * that was previously copy-pasted per form.
 */

export const fieldLabelClass =
  "text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase"

export function FieldLabel({
  htmlFor,
  className,
  children,
}: {
  htmlFor?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Label htmlFor={htmlFor} className={cn(fieldLabelClass, className)}>
      {children}
    </Label>
  )
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-destructive text-xs">{message}</p>
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input bg-background focus:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus:ring-1 focus:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  )
}
