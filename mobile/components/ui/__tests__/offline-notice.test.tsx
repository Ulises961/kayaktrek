import { render } from "@testing-library/react-native"

import { OfflineNotice } from "../offline-notice"

describe("OfflineNotice", () => {
  it("shows the screen's own message and how old the cached data is", async () => {
    const { getByText } = await render(
      <OfflineNotice cachedAt="2026-09-18T08:00:00.000Z" now={new Date("2026-09-20T08:00:00.000Z")}>
        Offline — showing your last synced logs.
      </OfflineNotice>,
    )

    expect(getByText(/Offline — showing your last synced logs\./)).toBeTruthy()
    expect(getByText(/Updated 2 days ago/)).toBeTruthy()
  })

  it("scales the age with how old the cache is", async () => {
    const { getByText } = await render(
      <OfflineNotice cachedAt="2026-09-20T07:30:00.000Z" now={new Date("2026-09-20T08:00:00.000Z")}>
        Offline.
      </OfflineNotice>,
    )

    expect(getByText(/Updated 30 min ago/)).toBeTruthy()
  })

  // A surface that has never been refreshed has no honest age to report —
  // better to say nothing than to render a placeholder that reads like one.
  it("omits the age line entirely when nothing was ever recorded", async () => {
    const { getByText, queryByText } = await render(
      <OfflineNotice cachedAt={null}>Offline — showing your last synced trips</OfflineNotice>,
    )

    expect(getByText(/Offline — showing your last synced trips/)).toBeTruthy()
    expect(queryByText(/Updated/)).toBeNull()
    expect(queryByText(/—$/)).toBeNull()
  })

  it("renders nothing at all when the screen is not on cached data", async () => {
    const { queryByText } = await render(
      <OfflineNotice cachedAt="2026-09-18T08:00:00.000Z" visible={false}>
        Offline.
      </OfflineNotice>,
    )

    expect(queryByText(/Offline\./)).toBeNull()
  })
})
