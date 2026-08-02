import { describe, it, expect } from "vitest"
import { redirect } from "next/navigation"
import { rethrowIfRedirect } from "../client"

// Deliberately does NOT mock next/navigation: the whole point is that the guard
// recognises a *real* redirect error. apiFetch signals "this session is gone" by
// calling redirect("/login"), which Next implements by throwing — so any bare
// `catch` between the fetch and the framework turns being signed out into a 404
// or an empty page, which reads as a broken app rather than as a sign-out.

function thrownBy(fn: () => void): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error("expected the function to throw")
}

describe("rethrowIfRedirect", () => {
  it("re-throws a real Next redirect error unchanged", () => {
    const redirectError = thrownBy(() => redirect("/login"))

    expect(() => rethrowIfRedirect(redirectError)).toThrow()
    try {
      rethrowIfRedirect(redirectError)
    } catch (error) {
      expect(error).toBe(redirectError)
    }
  })

  it("lets an ordinary failure through so the caller can handle it", () => {
    expect(() => rethrowIfRedirect(new Error("500 from the API"))).not.toThrow()
    expect(() => rethrowIfRedirect(undefined)).not.toThrow()
    expect(() => rethrowIfRedirect("not even an error")).not.toThrow()
  })
})
