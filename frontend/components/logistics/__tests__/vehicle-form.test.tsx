import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { VehicleForm } from "../vehicle-form"
import type { TripMember } from "@/lib/dtos/trip-member"

const MEMBER_ID = "01952f1a-0000-7000-8000-000000000020"

const MEMBERS: TripMember[] = [
  {
    id: MEMBER_ID,
    role: "leader",
    user: {
      id: "01952f1a-0000-7000-8000-000000000021",
      mail: "ana@example.com",
      username: "ana",
      name: "Ana",
      surname: "Font",
    },
  },
]

beforeEach(() => vi.clearAllMocks())

describe("VehicleForm", () => {
  it("submits member-driver data without external driver fields", async () => {
    const onSubmit = vi.fn()
    render(<VehicleForm members={MEMBERS} submitLabel="Add" onSubmit={onSubmit} />)
    await userEvent.type(screen.getByPlaceholderText(/vehicle description/i), "Blue VW")
    await userEvent.selectOptions(screen.getByRole("combobox"), MEMBER_ID)
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const fields = onSubmit.mock.calls[0][0]
    expect(fields.vehicleDescription).toBe("Blue VW")
    expect(fields.driverId).toBe(MEMBER_ID)
    expect(fields.driverName).toBeUndefined()
    expect(fields.driverContact).toBeUndefined()
  })

  it("submits external-driver data with driverId cleared", async () => {
    const onSubmit = vi.fn()
    render(<VehicleForm members={MEMBERS} submitLabel="Add" onSubmit={onSubmit} />)
    await userEvent.click(screen.getByRole("button", { name: /external/i }))
    await userEvent.type(screen.getByPlaceholderText(/driver name/i), "Pep")
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    const fields = onSubmit.mock.calls[0][0]
    expect(fields.driverId).toBeNull()
    expect(fields.driverName).toBe("Pep")
  })

  it("pre-fills from values and starts in external mode when the driver is external", async () => {
    render(
      <VehicleForm
        members={MEMBERS}
        submitLabel="Save"
        values={{
          driverId: null,
          driverName: "Pep",
          driverContact: "600 000 000",
          seatsAvailable: 3,
          kayakSpots: 2,
          vehicleDescription: "White Toyota",
          pickupPoint: "Harbour road",
        }}
        onSubmit={vi.fn()}
      />,
    )
    expect((screen.getByPlaceholderText(/vehicle description/i) as HTMLInputElement).value).toBe(
      "White Toyota",
    )
    expect((screen.getByPlaceholderText(/driver name/i) as HTMLInputElement).value).toBe("Pep")
  })

  it("shows a root error when provided", () => {
    render(<VehicleForm members={MEMBERS} error="Not a member." onSubmit={vi.fn()} />)
    expect(screen.getByText("Not a member.")).toBeDefined()
  })
})
