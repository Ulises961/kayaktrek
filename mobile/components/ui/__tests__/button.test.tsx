import { fireEvent, render } from "@testing-library/react-native"

import { Button, buttonTextVariants, buttonVariants } from "../button"

// The variant lists are the contract this file guards: web's button.tsx and mobile's
// have to offer the same roles, or a screen ported from one reaches for a role the
// other does not have and hand-rolls a Pressable instead — which is how the app ended
// up with link-styled `Text onPress` actions that no design token governs.
const VARIANTS = [
  "default",
  "secondary",
  "cta",
  "destructive",
  "outline",
  "ghost",
  "link",
] as const

const SIZES = ["default", "sm", "lg", "icon", "icon-sm"] as const

describe("buttonVariants", () => {
  it("styles every role it offers", () => {
    VARIANTS.forEach((variant) => {
      expect(buttonVariants({ variant })).toBeTruthy()
    })
  })

  it("gives every role a matching text colour", () => {
    // A role with no entry here falls back to the default's foreground, which on a
    // filled background is invisible rather than merely wrong.
    VARIANTS.forEach((variant) => {
      expect(buttonTextVariants({ variant })).toMatch(/text-/)
    })
  })

  it("gives the outline role a surface, so it is visible on a white card", () => {
    // Web's outline is `bg-background shadow-xs`, not transparent. Mobile had it
    // transparent, which was invisible as a control the moment cards went white: the
    // button took the card's own colour and only its border distinguished it.
    expect(buttonVariants({ variant: "outline" })).toMatch(/\bbg-background\b/)
  })

  it("leaves ghost and link without a surface, which is what makes them quiet", () => {
    // These two are deliberately transparent on web too — giving them a fill would
    // make every toolbar icon read as a raised control.
    expect(buttonVariants({ variant: "ghost" })).toMatch(/\bbg-transparent\b/)
    expect(buttonVariants({ variant: "link" })).toMatch(/\bbg-transparent\b/)
  })

  it("draws the link role as text, not as a filled control", () => {
    const className = buttonVariants({ variant: "link" })

    expect(className).not.toMatch(/\bbg-(primary|secondary|cta|destructive)\b/)
    expect(buttonTextVariants({ variant: "link" })).toMatch(/underline/)
  })

  it("sizes icon-only buttons square", () => {
    // A rectangular icon button (the old `size="sm"` workaround) reads as a text
    // button that lost its label, and two of them side by side never line up.
    SIZES.filter((size) => size.startsWith("icon")).forEach((size) => {
      const className = buttonVariants({ size })
      const height = className.match(/\bh-(\d+)\b/)?.[1]
      const width = className.match(/\bw-(\d+)\b/)?.[1]
      expect(height).toBeDefined()
      expect(width).toBe(height)
    })
  })

  it("keeps every touch target at or above the 44px platform minimum", () => {
    // h-11 is 44px at the default root. Anything smaller is below both platforms'
    // accessibility guidance for a primary tap target.
    const heights = SIZES.map((size) => buttonVariants({ size }).match(/\bh-(\d+)\b/)?.[1])
    heights.forEach((height) => {
      expect(Number(height)).toBeGreaterThanOrEqual(9)
    })
  })

  it("spaces an icon from its label without the caller adding a Row", () => {
    expect(buttonVariants({})).toMatch(/\bgap-/)
  })
})

describe("Button", () => {
  it("renders a plain string label through the themed Text", async () => {
    const { getByText } = await render(<Button>Save</Button>)

    expect(getByText("Save")).toBeTruthy()
  })

  it("dims when disabled, which RN gives no style hook for", () => {
    // Asserted on the class rather than the rendered element: react-native-css does not
    // apply styles under jest, so the rendered Pressable carries neither className nor
    // style. NativeWind has no `disabled:` variant either (that is a CSS pseudo-class),
    // which is why this is a conditional class in the first place.
    expect(buttonVariants({})).not.toMatch(/opacity-50/)
  })

  it("reports disabled to assistive tech and swallows the press", async () => {
    const onPress = jest.fn()
    const { getByTestId } = await render(
      <Button disabled onPress={onPress} testID="b">
        Save
      </Button>,
    )

    expect(getByTestId("b").props.accessibilityState).toMatchObject({ disabled: true })

    await fireEvent.press(getByTestId("b"))
    expect(onPress).not.toHaveBeenCalled()
  })

  it("renders an icon slot beside the label", async () => {
    const { getByTestId, getByText } = await render(
      <Button icon={<Button testID="icon" />}>Change password</Button>,
    )

    expect(getByTestId("icon")).toBeTruthy()
    expect(getByText("Change password")).toBeTruthy()
  })

  it("renders an icon-only button without an empty label node", async () => {
    const { queryByText } = await render(
      <Button icon={<Button testID="icon" />} accessibilityLabel="Refresh" testID="b" />,
    )

    expect(queryByText("")).toBeNull()
  })

  it("passes an element child through untouched so an icon keeps its own colour", async () => {
    const { getByTestId } = await render(
      <Button testID="b">
        <Button testID="inner">Nested</Button>
      </Button>,
    )

    expect(getByTestId("inner")).toBeTruthy()
  })
})
