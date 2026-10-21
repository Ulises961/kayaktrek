import { cn } from "@/lib/utils"

// One section of the Float plan tab as a surface of its own. Flat and tinted, with no
// shadow: the tab already sits inside the trip page's card, so a second raised card
// would read as a box in a box. Same surface the printable float plan gives its panels.
export function FloatPlanPanel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      className={cn("bg-muted/30 flex flex-col gap-4 rounded-lg border p-4", className)}
      {...props}
    />
  )
}
