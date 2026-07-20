import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({ setUnitPreference: vi.fn() }))

import { setUnitPreference } from "@/lib/profile/actions"
import { UnitPreferenceSelect } from "../unit-preference-select"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"

beforeEach(() => vi.clearAllMocks())

describe("UnitPreferenceSelect", () => {
  it("renders the current preference", () => {
    render(<UnitPreferenceSelect initialUnit={DISTANCE_UNIT.NM} />)
    expect(screen.getByRole("combobox")).toHaveValue(DISTANCE_UNIT.NM)
  })

  it("saves the new preference on change", async () => {
    vi.mocked(setUnitPreference).mockResolvedValue({ success: true })
    render(<UnitPreferenceSelect initialUnit={DISTANCE_UNIT.NM} />)
    await userEvent.selectOptions(screen.getByRole("combobox"), DISTANCE_UNIT.KM)
    expect(setUnitPreference).toHaveBeenCalledWith(DISTANCE_UNIT.KM)
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(DISTANCE_UNIT.KM))
  })

  it("reverts and shows an error on failure", async () => {
    vi.mocked(setUnitPreference).mockResolvedValue({ success: false, error: "Nope." })
    render(<UnitPreferenceSelect initialUnit={DISTANCE_UNIT.NM} />)
    await userEvent.selectOptions(screen.getByRole("combobox"), DISTANCE_UNIT.KM)
    await waitFor(() => expect(screen.getByText("Nope.")).toBeDefined())
    expect(screen.getByRole("combobox")).toHaveValue(DISTANCE_UNIT.NM)
  })
})
