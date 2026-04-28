import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { Size } from "@/lib/types/ui"

interface UserAvatarProps {
  name: string
  surname?: string | null
  imageUrl?: string | null
  size?: Size
  className?: string
}

function initials(name: string, surname?: string): string {
  const first = name.trim()[0]?.toUpperCase() ?? ""
  const last = surname?.trim()[0]?.toUpperCase() ?? ""
  return first + last || first
}

const sizeMap: Record<Size, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
}

export function UserAvatar({ name, surname, imageUrl, size = "md", className }: UserAvatarProps) {
  return (
    <Avatar size={sizeMap[size]} className={cn(className)}>
      {imageUrl && <AvatarImage src={imageUrl} alt={`${name} ${surname ?? ""}`.trim()} />}
      <AvatarFallback>{initials(name, surname)}</AvatarFallback>
    </Avatar>
  )
}
