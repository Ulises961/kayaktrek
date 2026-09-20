import { render } from "@testing-library/react-native"
import { StyleSheet } from "react-native"

import { lightTokens } from "@shared/tokens"

import { Card } from "../card"

function flatStyle(element: { props: { style?: unknown } }) {
  return StyleSheet.flatten(element.props.style) as Record<string, unknown>
}

describe("Card", () => {
  it("paints the neutral card surface, not a warm paper one", async () => {
    // Web's --card is plain white and the app background is the warm one. Mobile had
    // chart paper (#f7f4ec) baked in here instead, which sat a couple of points away
    // from --muted and left a card nearly indistinguishable from the controls on it.
    const { getByTestId } = await render(<Card testID="card" />)

    expect(flatStyle(getByTestId("card")).backgroundColor).toBe(lightTokens.card)
  })

  it("takes its border from the shared border token", async () => {
    const { getByTestId } = await render(<Card testID="card" />)
    const style = flatStyle(getByTestId("card"))

    expect(style.borderColor).toBe(lightTokens.border)
    expect(style.borderWidth).toBe(1)
  })

  it("does not hardcode a colour the palette has no name for", async () => {
    const { getByTestId } = await render(<Card testID="card" />)
    const style = flatStyle(getByTestId("card"))

    const named = new Set<unknown>(Object.values(lightTokens))
    // The shadow is deliberately excluded: a drop shadow is black everywhere and is
    // not a palette role.
    expect(named.has(style.backgroundColor)).toBe(true)
    expect(named.has(style.borderColor)).toBe(true)
  })

  it("still lets a caller override the surface", async () => {
    const { getByTestId } = await render(
      <Card testID="card" style={{ backgroundColor: lightTokens.muted }} />,
    )

    expect(flatStyle(getByTestId("card")).backgroundColor).toBe(lightTokens.muted)
  })
})
