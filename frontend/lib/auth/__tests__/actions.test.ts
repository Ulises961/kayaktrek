import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}))

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { login, register, logout } from "../actions"

const mockCookieStore = {
  set: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cookies).mockResolvedValue(mockCookieStore as any)
})

describe("login", () => {
  it("returns an error when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")))
    const result = await login(null, formData({ mail: "a@b.com", password: "pw" }))
    expect(result).toEqual({ success: false, error: expect.stringContaining("server") })
  })

  it("returns an error for invalid credentials (401)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    const result = await login(null, formData({ mail: "a@b.com", password: "wrong" }))
    expect(result).toEqual({ success: false, error: expect.stringContaining("Invalid") })
  })

  it("sets cookies and redirects on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "acc", refresh_token: "ref" }),
    }))
    await login(null, formData({ mail: "a@b.com", password: "correct" }))
    expect(mockCookieStore.set).toHaveBeenCalledWith("access_token", "acc", expect.any(Object))
    expect(mockCookieStore.set).toHaveBeenCalledWith("refresh_token", "ref", expect.any(Object))
    expect(redirect).toHaveBeenCalledWith("/dashboard")
  })
})

describe("register", () => {
  it("returns an error for duplicate email/username (409)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 409 }))
    const result = await register(null, formData({ mail: "a@b.com", username: "kayaker", name: "N", phone: "+34600000000", password: "Expedition#24" }))
    expect(result).toEqual({ success: false, error: expect.stringContaining("already in use") })
  })
})

describe("logout", () => {
  it("clears both cookies and redirects to /", async () => {
    await logout()
    expect(mockCookieStore.delete).toHaveBeenCalledWith("access_token")
    expect(mockCookieStore.delete).toHaveBeenCalledWith("refresh_token")
    expect(redirect).toHaveBeenCalledWith("/")
  })
})

// Helper
function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
  return fd
}
