import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }))

vi.mock("@/lib/profile/actions", () => ({
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
  removeAvatar: vi.fn(),
  uploadBanner: vi.fn(),
  removeBanner: vi.fn(),
}))

import {
  updateProfile,
  uploadAvatar,
  removeAvatar,
  uploadBanner,
  removeBanner,
} from "@/lib/profile/actions"
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

  it("switches to 'Replace photo' + 'Remove' after a successful upload", async () => {
    vi.mocked(uploadAvatar).mockResolvedValue({
      success: true,
      avatarUrl: "https://cdn.example.com/new.jpg",
    })
    render(<EditProfileForm user={BASE_USER} />)

    const file = new File(["x"], "photo.png", { type: "image/png" })
    const input = screen.getByTestId("avatar-file-input") as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /replace photo/i })).toBeInTheDocument(),
    )
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument()
  })

  it("shows an error and leaves the avatar unchanged when upload fails", async () => {
    vi.mocked(uploadAvatar).mockResolvedValue({ success: false, error: "File too large." })
    render(<EditProfileForm user={BASE_USER} />)

    const file = new File(["x"], "photo.png", { type: "image/png" })
    const input = screen.getByTestId("avatar-file-input") as HTMLInputElement
    await userEvent.upload(input, file)

    // Both conditions in one waitFor: the failure is only settled once the
    // transition has exited too. See vitest.setup.ts.
    await waitFor(() => {
      expect(screen.getByText("File too large.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /upload photo/i })).toBeEnabled()
    })
    // Still no avatar — upload failure must not flip the button to "Replace photo".
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument()
  })

  it("removes the avatar and shows 'Upload photo' again after a successful removal", async () => {
    vi.mocked(removeAvatar).mockResolvedValue({ success: true })
    render(<EditProfileForm user={{ ...BASE_USER, avatarUrl: "https://cdn.example.com/a.jpg" }} />)

    await userEvent.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^upload photo$/i })).toBeInTheDocument(),
    )
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument()
  })

  it("keeps the existing avatar and shows an error when removal fails", async () => {
    vi.mocked(removeAvatar).mockResolvedValue({ success: false, error: "Could not remove photo." })
    render(<EditProfileForm user={{ ...BASE_USER, avatarUrl: "https://cdn.example.com/a.jpg" }} />)

    await userEvent.click(screen.getByRole("button", { name: /remove/i }))

    // A failed removal must not silently succeed — the photo controls stay as-is.
    await waitFor(() => {
      expect(screen.getByText("Could not remove photo.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /replace photo/i })).toBeEnabled()
    })
    expect(screen.getByRole("button", { name: /remove/i })).toBeEnabled()
  })
})

describe("EditProfileForm — banner section", () => {
  it("shows only 'Upload banner' when there is no existing banner", () => {
    render(<EditProfileForm user={BASE_USER} />)
    expect(screen.getByRole("button", { name: /upload banner/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /replace banner/i })).not.toBeInTheDocument()
  })

  it("shows 'Replace banner' and 'Remove' when a banner exists", () => {
    render(<EditProfileForm user={{ ...BASE_USER, bannerUrl: "https://cdn.example.com/b.jpg" }} />)
    expect(screen.getByRole("button", { name: /replace banner/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^upload banner$/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument()
  })

  it("switches to 'Replace banner' + 'Remove' after a successful upload", async () => {
    vi.mocked(uploadBanner).mockResolvedValue({
      success: true,
      bannerUrl: "https://cdn.example.com/new-banner.jpg",
    })
    render(<EditProfileForm user={BASE_USER} />)

    const file = new File(["x"], "banner.png", { type: "image/png" })
    const input = screen.getByTestId("banner-file-input") as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /replace banner/i })).toBeInTheDocument(),
    )
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument()
  })

  it("shows an error and leaves the banner unchanged when upload fails", async () => {
    vi.mocked(uploadBanner).mockResolvedValue({ success: false, error: "File too large." })
    render(<EditProfileForm user={BASE_USER} />)

    const file = new File(["x"], "banner.png", { type: "image/png" })
    const input = screen.getByTestId("banner-file-input") as HTMLInputElement
    await userEvent.upload(input, file)

    await waitFor(() => {
      expect(screen.getByText("File too large.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /upload banner/i })).toBeEnabled()
    })
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument()
  })

  it("removes the banner and shows 'Upload banner' again after a successful removal", async () => {
    vi.mocked(removeBanner).mockResolvedValue({ success: true })
    render(<EditProfileForm user={{ ...BASE_USER, bannerUrl: "https://cdn.example.com/b.jpg" }} />)

    await userEvent.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^upload banner$/i })).toBeInTheDocument(),
    )
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument()
  })

  it("keeps the existing banner and shows an error when removal fails", async () => {
    vi.mocked(removeBanner).mockResolvedValue({ success: false, error: "Could not remove banner." })
    render(<EditProfileForm user={{ ...BASE_USER, bannerUrl: "https://cdn.example.com/b.jpg" }} />)

    await userEvent.click(screen.getByRole("button", { name: /remove/i }))

    await waitFor(() => {
      expect(screen.getByText("Could not remove banner.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /replace banner/i })).toBeEnabled()
    })
    expect(screen.getByRole("button", { name: /remove/i })).toBeEnabled()
  })
})

describe("EditProfileForm — submit", () => {
  it("saves and navigates to /profile on success", async () => {
    vi.mocked(updateProfile).mockResolvedValue({ success: true })
    render(<EditProfileForm user={BASE_USER} />)

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalled())
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/profile"))
  })

  it("shows a root error and does not navigate when the save fails", async () => {
    vi.mocked(updateProfile).mockResolvedValue({
      success: false,
      error: "That username is already taken.",
    })
    render(<EditProfileForm user={BASE_USER} />)

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }))

    // The save button re-enables so the user can correct the field and retry.
    await waitFor(() => {
      expect(screen.getByText("That username is already taken.")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })
})
