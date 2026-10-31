import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// Mirrors frontend/lib/utils.ts's cn() exactly — same convention, kept as a small
// local copy rather than imported over watchFolders because it is styling-library
// glue (clsx + tailwind-merge), not a design token or a domain schema. Only tokens.ts
// and lib/dtos/* are meant to be shared verbatim (the M9a plan WP5).
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
