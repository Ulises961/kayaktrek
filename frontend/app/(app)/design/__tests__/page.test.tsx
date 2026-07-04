import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))
vi.mock("next/navigation", () => ({ notFound }))

import DesignPage from "../page"

describe("DesignPage", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    notFound.mockClear()
  })

  it("404s in production — this is a dev-only component showcase", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(() => DesignPage()).toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalled()
  })

  it("renders normally outside production", () => {
    vi.stubEnv("NODE_ENV", "test")
    render(DesignPage())
    expect(screen.getByRole("heading", { name: "Design Lab" })).toBeInTheDocument()
    expect(notFound).not.toHaveBeenCalled()
  })
})
