import type { ZodError } from "zod"

// The first message per field — a field with two failed rules shows one line, not a stack. The
// key is the field's name, the same one the shared schema declares it under.
export function fieldErrors(error: ZodError): Record<string, string> {
  const messages: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "")
    if (field && !(field in messages)) messages[field] = issue.message
  }
  return messages
}
