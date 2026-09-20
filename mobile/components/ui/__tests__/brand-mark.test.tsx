import { render } from "@testing-library/react-native"
import { processColor } from "react-native"

import { palette } from "@shared/tokens"

import { BrandMark } from "../brand-mark"

// react-native-svg renders to host elements (`RNSVGPath`), and RNTL 14's element model
// exposes only those — `queryAll` by host type is the way in. Fills arrive processed
// into ARGB payloads, so expectations go through `processColor` rather than hex strings.
function pathsIn(tree: Awaited<ReturnType<typeof render>>) {
  const root = tree.root
  if (!root) throw new Error("expected the mark to render")

  const paths = root.queryAll((element) => element.type === "RNSVGPath")
  expect(paths.length).toBeGreaterThan(0)
  return paths
}

function inks(tree: Awaited<ReturnType<typeof render>>): Set<unknown> {
  return new Set(pathsIn(tree).map((node) => (node.props.fill as { payload: unknown }).payload))
}

function expectedInks(...colors: string[]): Set<unknown> {
  return new Set(colors.map((color) => processColor(color)))
}

describe("BrandMark", () => {
  it("paints the default mark in its three brand inks", async () => {
    const tree = await render(<BrandMark />)

    // The three-tone split is the mark's identity (ink hull / lit face / sunset north),
    // so a regression that flattened it would still render a compass and still pass a
    // "renders something" assertion — assert the tones themselves.
    expect(inks(tree)).toEqual(
      expectedInks(palette.ocean900, palette.ocean500, palette.sunset500),
    )
  })

  it("paints every point in one ink when given a colour", async () => {
    const tree = await render(<BrandMark color={palette.ocean100} />)

    // docs/brand/compass-mark-brief.md's `compass-mono.svg` variant: single ink, no
    // accent, for dark surfaces and anywhere the mark must tint to its context.
    expect(inks(tree)).toEqual(expectedInks(palette.ocean100))
  })

  it("keeps the three inks when no colour is given, even with an opacity", async () => {
    const tree = await render(<BrandMark opacity={0.08} />)

    expect(inks(tree)).toEqual(
      expectedInks(palette.ocean900, palette.ocean500, palette.sunset500),
    )
  })

  it("applies opacity once to the whole mark, not to each point", async () => {
    // Per-path opacity would double up wherever the compass points overlap, printing
    // seams across the watermark. It has to land once, on the root.
    const tree = await render(<BrandMark opacity={0.08} />)

    const style = tree.toJSON()?.props.style as Record<string, unknown>[]
    expect(style.some((layer) => layer?.opacity === 0.08)).toBe(true)

    pathsIn(tree).forEach((node) => {
      expect(node.props.opacity).toBeUndefined()
    })
  })
})
