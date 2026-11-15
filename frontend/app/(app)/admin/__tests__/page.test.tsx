import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import type { User } from "@/lib/dtos/user"

const { notFound, getMe } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  getMe: vi.fn(),
}))
vi.mock("next/navigation", () => ({ notFound }))
vi.mock("@/lib/user/me", () => ({ getMe }))
vi.mock("@/components/common/set-breadcrumbs", () => ({ SetBreadcrumbs: () => null }))
vi.mock("@/components/admin/correct-unverified-mail-form", () => ({
  CorrectUnverifiedMailForm: () => <form aria-label="correct mail" />,
}))

import AdminPage from "../page"

describe("AdminPage", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("404s for someone who is not an administrator", async () => {
    getMe.mockResolvedValue({ admin: false } as User)

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalled()
  })

  it("404s when the account has no admin flag at all", async () => {
    getMe.mockResolvedValue({} as User)

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("404s when the user could not be loaded, rather than offering a form", async () => {
    getMe.mockResolvedValue(null)

    await expect(AdminPage()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("offers the correction form to an administrator", async () => {
    getMe.mockResolvedValue({ admin: true } as User)

    render(await AdminPage())

    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument()
    expect(screen.getByRole("form", { name: "correct mail" })).toBeInTheDocument()
    expect(notFound).not.toHaveBeenCalled()
  })
})
