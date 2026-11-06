import { render, screen } from "@testing-library/react-native"

import type { CrewStatusRow } from "@mobile/lib/live/crew-status"

import { CrewStatusList } from "../crew-status-list"

function row(overrides: Partial<CrewStatusRow> = {}): CrewStatusRow {
  return { userId: "u1", name: "Ada Paddler", role: "crew", heardAgo: "3 min ago", quiet: false, ...overrides }
}

describe("CrewStatusList", () => {
  it("shows each member with how long ago they were last heard from", async () => {
    await render(<CrewStatusList rows={[row(), row({ userId: "u2", name: "Bea Paddler", heardAgo: "1 h 5 min ago", quiet: true })]} />)

    expect(screen.getByText("Ada Paddler")).toBeTruthy()
    expect(screen.getByText("3 min ago")).toBeTruthy()
    expect(screen.getByText("Bea Paddler")).toBeTruthy()
    expect(screen.getByText("1 h 5 min ago")).toBeTruthy()
  })

  it("says plainly when a member has not shared a position, instead of showing a blank", async () => {
    await render(<CrewStatusList rows={[row({ heardAgo: null, quiet: true })]} />)

    expect(screen.getByText("No position shared yet")).toBeTruthy()
  })

  it("marks the leader", async () => {
    await render(<CrewStatusList rows={[row({ role: "leader" }), row({ userId: "u2", name: "Bea Paddler" })]} />)

    expect(screen.getAllByText("Leader")).toHaveLength(1)
  })

  it("says so when there is no one to list", async () => {
    await render(<CrewStatusList rows={[]} />)

    expect(screen.getByText("No crew on this phone yet.")).toBeTruthy()
  })
})
