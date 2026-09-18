import { render } from "@testing-library/react-native"

import type { PaddlerSearchResult } from "@shared/dtos/paddler-search"

import { PaddlerResultCard } from "../paddler-result-card"

const PADDLER: PaddlerSearchResult = {
  id: "user-1",
  username: "ada",
  name: "Ada",
  surname: "Lovelace",
  relationship: "none",
  certifications: [],
}

// Web makes every paddler name and avatar a link to the public profile
// (buddies-list.tsx, paddler-result-card.tsx). Mobile rendered them as plain
// text, which left (paddlers)/paddlers/[username].tsx with no inbound
// navigation at all — the screen existed and nothing could reach it.
describe("PaddlerResultCard", () => {
  it("makes the paddler's name a link to their public profile", async () => {
    const { getByRole } = await render(
      <PaddlerResultCard paddler={PADDLER} busy={false} onConnect={() => {}} onCancel={() => {}} />,
    )

    // Declared explicitly rather than inherited: web's <a> carries the link role
    // for free, a RN Pressable announces as a button unless told otherwise.
    expect(getByRole("link", { name: "Ada Lovelace" })).toBeTruthy()
  })

  it("still shows the relationship action beside the link", async () => {
    const { getByText } = await render(
      <PaddlerResultCard paddler={PADDLER} busy={false} onConnect={() => {}} onCancel={() => {}} />,
    )

    expect(getByText("Connect")).toBeTruthy()
  })

  it("names the link by the paddler, not by the raw username handle", async () => {
    const { getByRole, queryByRole } = await render(
      <PaddlerResultCard
        paddler={{ ...PADDLER, surname: null }}
        busy={false}
        onConnect={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(getByRole("link", { name: "Ada" })).toBeTruthy()
    expect(queryByRole("link", { name: "@ada" })).toBeNull()
  })
})
