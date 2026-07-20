import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }))

vi.mock("@/lib/profile/actions", () => ({
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
}))

import { EditProfileForm } from "../edit-profile-form"
import type { User } from "@/lib/dtos/user"

const BASE_USER: User = {
  id: "01952f1a-0000-7000-8000-000000000001",
  mail: "a@example.com",
  username: "ada",
  name: "Ada",
  surname: "Lovelace",
  avatarUrl: null,
  unitPreference: "nm",
}

beforeEach(() => vi.clearAllMocks())

describe("EditProfileForm — avatar section", () => {
  it("shows only 'Upload photo' when there is no existing avatar", () => {
    render(<EditProfileForm user={BASE_USER} />)
    expect(screen.getByRole("button", { name: /upload photo/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /replace photo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument()
  })

  it("shows 'Replace photo' (not 'Upload photo') and 'Remove' when an avatar exists", () => {
    render(<EditProfileForm user={{ ...BASE_USER, avatarUrl: "https://cdn.example.com/a.jpg" }} />)
    expect(screen.getByRole("button", { name: /replace photo/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^upload photo$/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument()
  })

  it("renders the replace and remove actions on the same row, not stacked", () => {
    render(<EditProfileForm user={{ ...BASE_USER, avatarUrl: "https://cdn.example.com/a.jpg" }} />)
    const replaceButton = screen.getByRole("button", { name: /replace photo/i })
    const removeButton = screen.getByRole("button", { name: /remove/i })
    expect(replaceButton.parentElement).toBe(removeButton.parentElement)
    expect(replaceButton.parentElement?.className).not.toMatch(/flex-col/)
  })
})
