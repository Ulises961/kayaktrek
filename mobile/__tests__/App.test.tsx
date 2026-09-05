import { render } from "@testing-library/react-native"

import App from "../App"

// Proves the whole WP5 chain end to end, not just that the screen renders: Metro's
// watchFolders resolves `../frontend/lib/{tokens,dtos/point}`, the mock Point actually
// parses through the real Zod schema (an invalid shape would throw before this render),
// and the parsed field reaches the screen through a NativeWind-styled atom.
//
// `render()` is async in this @testing-library/react-native version (it awaits the
// underlying `test-renderer` root's `act()` internally) — must be awaited, and its
// returned queries are used directly rather than the `screen` singleton, which never
// registers when render is awaited from inside a plain (non-async) test body.
describe("App", () => {
  it("renders the parsed DTO field pulled in from the frontend workspace", async () => {
    const { getByText } = await render(<App />)

    expect(getByText("Porthmadog slipway")).toBeTruthy()
    expect(
      getByText("High-water launch only — check the rule of twelfths before setting off."),
    ).toBeTruthy()
  })
})
