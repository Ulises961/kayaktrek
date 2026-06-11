import { PackageIcon } from "lucide-react"

export function ItemsTab() {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <PackageIcon className="text-muted-foreground size-4" />
        Items
      </p>
      <p className="text-muted-foreground text-sm italic">Gear and inventory coming in M6.</p>
    </div>
  )
}
