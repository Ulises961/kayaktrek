import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { processColor } from "react-native"

import { palette } from "@shared/tokens"

import LoginScreen from "../app/(auth)/login"
import { useAuth } from "../lib/auth/auth-context"

jest.mock("../lib/auth/auth-context", () => ({
  useAuth: jest.fn(),
}))

const mockUseAuth = useAuth as jest.Mock

describe("LoginScreen", () => {
  beforeEach(() => {
    mockUseAuth.mockReset()
  })

  it("submits the entered credentials to signIn", async () => {
    const signIn = jest.fn().mockResolvedValue({ success: true })
    mockUseAuth.mockReturnValue({ status: "unauthenticated", signIn, signOut: jest.fn() })

    const { getByTestId } = await render(<LoginScreen />)

    await fireEvent.changeText(getByTestId("login-email"), "paddler@example.com")
    await fireEvent.changeText(getByTestId("login-password"), "correct-horse")
    await fireEvent.press(getByTestId("login-submit"))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("paddler@example.com", "correct-horse")
    })
  })

  it("shows the server's error message on a failed sign-in, not a generic fallback", async () => {
    const signIn = jest.fn().mockResolvedValue({
      success: false,
      error: "Invalid email or password.",
    })
    mockUseAuth.mockReturnValue({ status: "unauthenticated", signIn, signOut: jest.fn() })

    const { getByTestId, findByText } = await render(<LoginScreen />)

    await fireEvent.changeText(getByTestId("login-email"), "paddler@example.com")
    await fireEvent.changeText(getByTestId("login-password"), "wrong")
    await fireEvent.press(getByTestId("login-submit"))

    expect(await findByText("Invalid email or password.")).toBeTruthy()
  })

  describe("hero backdrop", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        status: "unauthenticated",
        signIn: jest.fn(),
        signOut: jest.fn(),
      })
    })

    it("renders the ocean hero behind the form", async () => {
      const { getByTestId } = await render(<LoginScreen />)

      expect(getByTestId("login-hero")).toBeTruthy()
    })

    it("draws the watermark in a single ink so it cannot compete with the form", async () => {
      const { getByTestId } = await render(<LoginScreen />)
      const watermark = getByTestId("login-hero-watermark")

      // The three-tone mark (including sunset500) at watermark scale would read as a
      // second focal point behind the card. The hero uses the mono variant instead.
      //
      // The ink is a pale one (ocean100) rather than a mid one: the ground is a gradient
      // that lightens from ocean900 to ocean600, so a mid ink would sit above the ground
      // at the top and below it at the bottom, fading out across the middle. A pale ink
      // at low alpha stays a consistent lift over the whole run.
      const paths = watermark.queryAll((element) => element.type === "RNSVGPath")
      expect(paths.length).toBeGreaterThan(0)

      const inks = new Set(paths.map((node) => (node.props.fill as { payload: unknown }).payload))
      expect(inks).toEqual(new Set([processColor(palette.ocean100)]))
    })

    it("keeps the sign-in form reachable above the backdrop", async () => {
      // A full-bleed absolutely-positioned backdrop that renders after the form would
      // swallow every press. The form still has to work.
      const signIn = jest.fn().mockResolvedValue({ success: true })
      mockUseAuth.mockReturnValue({ status: "unauthenticated", signIn, signOut: jest.fn() })

      const { getByTestId } = await render(<LoginScreen />)

      await fireEvent.changeText(getByTestId("login-email"), "paddler@example.com")
      await fireEvent.changeText(getByTestId("login-password"), "correct-horse")
      await fireEvent.press(getByTestId("login-submit"))

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith("paddler@example.com", "correct-horse")
      })
    })
  })
})
