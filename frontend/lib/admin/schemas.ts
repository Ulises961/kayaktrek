import { z } from "zod"

// Support's side of a mistyped signup address: who to move, and where to.
export const CorrectUnverifiedMailSchema = z.object({
  username: z.string().trim().min(1, "Username is required."),
  newMail: z.string().trim().email("Enter a valid email address."),
})

// What POST /user/correct-unverified-mail answers: the account it moved, and the address as
// stored (lower-cased), so the admin can see what the owner will actually be mailed at.
export const CorrectUnverifiedMailResponseSchema = z.object({
  username: z.string(),
  mail: z.string(),
})

export type CorrectUnverifiedMailInput = z.infer<typeof CorrectUnverifiedMailSchema>
