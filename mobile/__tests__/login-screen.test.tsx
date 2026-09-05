import { fireEvent, render, waitFor } from "@testing-library/react-native"

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
})
