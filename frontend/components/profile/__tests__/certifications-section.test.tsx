import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({ reAuth: vi.fn() }))
vi.mock("@/lib/certifications/actions", () => ({
  addCertification: vi.fn(),
  updateCertification: vi.fn(),
  deleteCertification: vi.fn(),
  listCertifications: vi.fn(),
}))

import { reAuth } from "@/lib/profile/actions"
import {
  addCertification,
  deleteCertification,
  listCertifications,
} from "@/lib/certifications/actions"
import { CertificationsSection } from "../certifications-section"
import type { Certification } from "@/lib/dtos/certification"

const CERT: Certification = {
  id: "01952f1a-0000-7000-8000-000000000030",
  organization: "British Canoeing",
  award: "Sea Kayak Leader",
  validUntil: "2999-01-01",
}

const EXPIRED: Certification = {
  id: "01952f1a-0000-7000-8000-000000000031",
  organization: "RYA",
  award: "Day Skipper",
  validUntil: "2000-01-01",
}

beforeEach(() => vi.clearAllMocks())

describe("CertificationsSection", () => {
  it("shows an empty state when there are no certs", () => {
    render(<CertificationsSection initialCerts={[]} />)
    expect(screen.getByText(/no certifications yet/i)).toBeDefined()
  })

  it("lists certifications and flags an expired one", () => {
    render(<CertificationsSection initialCerts={[CERT, EXPIRED]} />)
    expect(screen.getByText("Sea Kayak Leader")).toBeDefined()
    expect(screen.getByText("Day Skipper")).toBeDefined()
    expect(screen.getByText(/expired/i)).toBeDefined()
  })

  async function fillAndSubmitAddForm() {
    await userEvent.click(screen.getByRole("button", { name: /add certification/i }))
    const formDialog = await screen.findByRole("dialog", { name: /add certification/i })
    await userEvent.type(within(formDialog).getByLabelText("Organization"), "British Canoeing")
    await userEvent.type(within(formDialog).getByLabelText("Award"), "Sea Kayak Leader")
    await userEvent.click(within(formDialog).getByRole("button", { name: /add certification/i }))
  }

  async function confirmPassword() {
    const authDialog = await screen.findByRole("dialog", { name: /confirm your password/i })
    await userEvent.type(within(authDialog).getByLabelText("Password"), "hunter2!A")
    await userEvent.click(within(authDialog).getByRole("button", { name: /continue/i }))
  }

  it("prompts for the password before adding a certification", async () => {
    render(<CertificationsSection initialCerts={[]} />)
    await fillAndSubmitAddForm()

    // No cached token yet → re-auth prompt appears, mutation not yet called.
    await waitFor(() => expect(screen.getByText(/confirm your password/i)).toBeDefined())
    expect(addCertification).not.toHaveBeenCalled()
  })

  it("adds a certification after successful re-auth", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: "tok" })
    vi.mocked(addCertification).mockResolvedValue({ success: true })
    vi.mocked(listCertifications).mockResolvedValue({ success: true, certifications: [CERT] })

    render(<CertificationsSection initialCerts={[]} />)
    await fillAndSubmitAddForm()
    await confirmPassword()

    await waitFor(() => expect(addCertification).toHaveBeenCalledWith("tok", expect.anything()))
    await waitFor(() => expect(listCertifications).toHaveBeenCalled())
  })

  it("deletes a certification through the elevated flow", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: "tok" })
    vi.mocked(deleteCertification).mockResolvedValue({ success: true })

    render(<CertificationsSection initialCerts={[CERT]} />)
    await userEvent.click(screen.getByRole("button", { name: /delete certification/i }))
    await confirmPassword()

    await waitFor(() => expect(deleteCertification).toHaveBeenCalledWith("tok", CERT.id))
    await waitFor(() => expect(screen.queryByText("Sea Kayak Leader")).toBeNull())
  })
})
