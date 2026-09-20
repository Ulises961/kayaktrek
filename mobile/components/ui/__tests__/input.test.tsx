import { render } from "@testing-library/react-native"
// `../text` is imported before `../input` on purpose. RN's jest mock of TextInput
// requires its mock of Text, and react-native-css wraps Text at that moment — if nothing
// has initialised the css layer's Text yet, copyComponentProperties reads an undefined
// component and throws before any test runs. Importing the Text primitive first does
// that initialisation. Screen suites never hit this because they always reach a Text
// component on the way down. jest.setup.ts documents the same ordering hazard for
// react-native-gesture-handler.
import "../text"

import { lightTokens } from "@shared/tokens"

import { Input, inputClassName } from "../input"

describe("Input", () => {
  it("places its placeholder in the muted-foreground role", async () => {
    // Was a raw slate (#94a3b8) that no palette role names, so it matched nothing else
    // on the screen.
    const { getByTestId } = await render(<Input testID="input" placeholder="Search" />)

    expect(getByTestId("input").props.placeholderTextColor).toBe(lightTokens.mutedForeground)
  })

  it("takes the colour of whatever surface it sits on", () => {
    // Deliberately the opposite of the outline button, and the same split web makes:
    // a button is a raised control, so it carries its own `bg-background` surface; a
    // field is a recess in the surface it sits in, so it stays transparent and picks
    // up the card's white. Giving the field its own sand fill made every form read as
    // a stack of sand bars on a white card.
    expect(inputClassName).toContain("bg-transparent")
    expect(inputClassName).not.toContain("bg-background")
  })
})
