import { PackageIcon } from "lucide-react"

export function ItemsTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium flex items-center gap-2">
        <PackageIcon className="size-4 text-muted-foreground" />
        Items
      </p>
      <p className="text-sm text-muted-foreground italic">
        Gear and inventory coming in M6.
      </p>
    </div>
  )
}
