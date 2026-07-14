import type { ElementType, ComponentPropsWithoutRef } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Shared row-enclosure recipe for list surfaces (M12 §O): a bottom hairline
// per row (none after the last) instead of ad hoc per-surface treatments —
// day lists, crew lists, gear rows, and the items tab all speak this same
// separator language. Optional zebra banding uses the surface-2 token.
// Baseline discipline is the call site's job: keep the row's label and any
// trailing metric on one baseline (flex items-center / items-baseline).
export const listRowClass = cva("border-border/50 border-b last:border-b-0", {
  variants: {
    zebra: {
      true: "odd:bg-surface-2/50",
      false: "",
    },
  },
  defaultVariants: { zebra: false },
})

type ListRowProps<T extends ElementType> = {
  as?: T
  className?: string
} & VariantProps<typeof listRowClass> &
  Omit<ComponentPropsWithoutRef<T>, "as" | "className">

// Thin polymorphic wrapper over listRowClass — defaults to <li>, pass
// as="div" for non-list markup (matches the small-composable-primitive
// precedent in components/common/form-field.tsx).
export function ListRow<T extends ElementType = "li">({
  as,
  zebra,
  className,
  ...props
}: ListRowProps<T>) {
  const Comp = (as ?? "li") as ElementType
  return <Comp className={cn(listRowClass({ zebra }), className)} {...props} />
}
