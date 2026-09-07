import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import AboutPage from "../page"
import packageJson from "@/package.json"

describe("AboutPage", () => {
  it("shows the current app version", () => {
    render(<AboutPage />)
    const escapedVersion = packageJson.version.replace(/\./g, "\\.")
    expect(screen.getByText(new RegExp(`v${escapedVersion}`))).toBeInTheDocument()
  })

  it("links to the operator's GitHub profile", () => {
    render(<AboutPage />)
    expect(screen.getByRole("link", { name: /github/i })).toHaveAttribute(
      "href",
      "https://github.com/Ulises961",
    )
  })

  it("links to the support email for bugs and questions", () => {
    render(<AboutPage />)
    expect(screen.getByRole("link", { name: /support@kayaktrek\.app/i })).toHaveAttribute(
      "href",
      "mailto:support@kayaktrek.app",
    )
  })

  it("links back to the app from the header", () => {
    render(<AboutPage />)
    expect(screen.getByRole("link", { name: /^kayaktrek/i })).toHaveAttribute("href", "/")
  })
})
