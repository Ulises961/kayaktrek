import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("@/lib/api/client", () => ({
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
  apiPost: vi.fn(),
  apiUpload: vi.fn(),
}))
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }))

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { apiPatch, apiDelete, apiPost, apiUpload } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import {
  updateProfile,
  uploadAvatar,
  removeAvatar,
  changePassword,
  requestDataExport,
  requestAccountDeletion,
} from "../actions"

const USER_ID = "01952f1a-0000-7000-8000-000000000001"
const SESSION = { userId: USER_ID, email: "ada@example.com", isAdmin: false }

const PROFILE_FIELDS = {
  name: "Ada",
  username: "ada",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getSession).mockResolvedValue(SESSION)
})

describe("updateProfile", () => {
  it("patches the correct path with the provided fields", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateProfile(PROFILE_FIELDS)
    expect(apiPatch).toHaveBeenCalledWith(
      `/api/user/${USER_ID}`,
      expect.objectContaining({ name: "Ada", username: "ada" })
    )
  })

  it("converts empty vesselLengthCm to null", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateProfile({ ...PROFILE_FIELDS, vesselLengthCm: "" })
    expect(apiPatch).toHaveBeenCalledWith(
      `/api/user/${USER_ID}`,
      expect.objectContaining({ vesselLengthCm: null })
    )
  })

  it("converts a numeric string vesselLengthCm to a number", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateProfile({ ...PROFILE_FIELDS, vesselLengthCm: "518" })
    expect(apiPatch).toHaveBeenCalledWith(
      `/api/user/${USER_ID}`,
      expect.objectContaining({ vesselLengthCm: 518 })
    )
  })

  it("revalidates /profile on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await updateProfile(PROFILE_FIELDS)
    expect(revalidatePath).toHaveBeenCalledWith("/profile")
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    expect(await updateProfile(PROFILE_FIELDS)).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("400"))
    expect(await updateProfile(PROFILE_FIELDS)).toEqual({ success: false, error: expect.any(String) })
  })

  it("redirects to /login when there is no session", async () => {
    vi.mocked(getSession).mockResolvedValue(null)
    await updateProfile(PROFILE_FIELDS)
    expect(redirect).toHaveBeenCalledWith("/login")
  })
})

describe("uploadAvatar", () => {
  const AVATAR_USER = {
    id: USER_ID,
    mail: "ada@example.com",
    username: "ada",
    name: "Ada",
    avatarUrl: "http://localhost:9000/kplanner/avatars/new.jpg",
  }

  it("uploads to /api/user/me/avatar", async () => {
    vi.mocked(apiUpload).mockResolvedValue(AVATAR_USER)
    const fd = new FormData()
    await uploadAvatar(fd)
    expect(apiUpload).toHaveBeenCalledWith("/api/user/me/avatar", fd)
  })

  it("returns success: true with the new avatarUrl", async () => {
    vi.mocked(apiUpload).mockResolvedValue(AVATAR_USER)
    const result = await uploadAvatar(new FormData())
    expect(result).toEqual({ success: true, avatarUrl: AVATAR_USER.avatarUrl })
  })

  it("revalidates /profile on success", async () => {
    vi.mocked(apiUpload).mockResolvedValue(AVATAR_USER)
    await uploadAvatar(new FormData())
    expect(revalidatePath).toHaveBeenCalledWith("/profile")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiUpload).mockRejectedValue(new Error("400"))
    expect(await uploadAvatar(new FormData())).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("removeAvatar", () => {
  it("sends DELETE to /api/user/me/avatar", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await removeAvatar()
    expect(apiDelete).toHaveBeenCalledWith("/api/user/me/avatar")
  })

  it("revalidates /profile on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await removeAvatar()
    expect(revalidatePath).toHaveBeenCalledWith("/profile")
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    expect(await removeAvatar()).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("changePassword", () => {
  it("patches /api/user/me/password with currentPwd and newPwd", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    await changePassword("old", "New1!")
    expect(apiPatch).toHaveBeenCalledWith("/api/user/me/password", { currentPwd: "old", newPwd: "New1!" })
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPatch).mockResolvedValue(undefined)
    expect(await changePassword("old", "New1!")).toEqual({ success: true })
  })

  it("returns a user-friendly error on 400", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("PATCH /api/user/me/password failed: 400"))
    const result = await changePassword("wrong", "New1!")
    expect(result).toEqual({ success: false, error: "Current password is incorrect." })
  })

  it("returns a generic error on other failures", async () => {
    vi.mocked(apiPatch).mockRejectedValue(new Error("500"))
    expect(await changePassword("old", "New1!")).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("requestDataExport", () => {
  it("posts to /api/user/me/data-export", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    await requestDataExport()
    expect(apiPost).toHaveBeenCalledWith("/api/user/me/data-export", {})
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiPost).mockResolvedValue(undefined)
    expect(await requestDataExport()).toEqual({ success: true })
  })

  it("returns a user-friendly message on 429", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("POST /api/user/me/data-export failed: 429"))
    const result = await requestDataExport()
    expect(result).toEqual({ success: false, error: "You can only request a data export once per day." })
  })

  it("returns a generic error on other failures", async () => {
    vi.mocked(apiPost).mockRejectedValue(new Error("500"))
    expect(await requestDataExport()).toEqual({ success: false, error: expect.any(String) })
  })
})

describe("requestAccountDeletion", () => {
  it("sends DELETE to /api/user/me", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    await requestAccountDeletion()
    expect(apiDelete).toHaveBeenCalledWith("/api/user/me")
  })

  it("returns success: true on success", async () => {
    vi.mocked(apiDelete).mockResolvedValue(undefined)
    expect(await requestAccountDeletion()).toEqual({ success: true })
  })

  it("returns success: false when the API throws", async () => {
    vi.mocked(apiDelete).mockRejectedValue(new Error("404"))
    expect(await requestAccountDeletion()).toEqual({ success: false, error: expect.any(String) })
  })
})
