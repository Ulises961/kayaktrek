import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { Linking } from "react-native"

import RegisterScreen from "../app/(auth)/register"
import { WEB_ORIGIN } from "../lib/api/config"
import { register } from "../lib/auth/actions"
import { useAuth } from "../lib/auth/auth-context"
import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

const mockReplace = jest.fn()

jest.mock("expo-router", () => {
  const { cloneElement } = jest.requireActual("react")
  return {
    Redirect: () => null,
    Link: ({ children, href }: { children: React.ReactElement; href: string }) =>
      cloneElement(children, { accessibilityHint: href }),
    useRouter: () => ({ replace: mockReplace }),
  }
})
jest.mock("../lib/auth/auth-context", () => ({ useAuth: jest.fn() }))
jest.mock("../lib/auth/actions", () => ({ register: jest.fn() }))

const mockUseAuth = useAuth as jest.Mock
const mockRegister = register as jest.Mock

const VALID_PASSWORD = "Correct-Horse-9!"

async function renderRegister() {
  return render(<RegisterScreen />, { wrapper: WithCachedSurfaces })
}

type Screen = Awaited<ReturnType<typeof renderRegister>>

async function fill(
  screen: Screen,
  fields: { mail?: string; username?: string; password?: string },
) {
  const values = {
    mail: "paddler@example.com",
    username: "paddler_1",
    password: VALID_PASSWORD,
    ...fields,
  }
  await fireEvent.changeText(screen.getByTestId("register-email"), values.mail)
  await fireEvent.changeText(screen.getByTestId("register-username"), values.username)
  await fireEvent.changeText(screen.getByTestId("register-password"), values.password)
}

describe("RegisterScreen", () => {
  beforeEach(() => {
    mockReplace.mockReset()
    mockRegister.mockReset().mockResolvedValue({ success: true })
    mockUseAuth.mockReturnValue({ status: "unauthenticated", signIn: jest.fn(), signOut: jest.fn() })
    jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("creates the account from what was typed, then sends the user to sign in with the notice", async () => {
    const screen = await renderRegister()

    await fill(screen, {})
    await fireEvent.press(screen.getByTestId("register-submit"))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith("paddler@example.com", "paddler_1", VALID_PASSWORD)
    })
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/login", params: { registered: "1" } })
  })

  it("trims the address before sending it", async () => {
    const screen = await renderRegister()

    await fill(screen, { mail: "  paddler@example.com " })
    await fireEvent.press(screen.getByTestId("register-submit"))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith("paddler@example.com", "paddler_1", VALID_PASSWORD)
    })
  })

  it("refuses a malformed address before anything is sent", async () => {
    const screen = await renderRegister()

    await fill(screen, { mail: "paddler@" })
    await fireEvent.press(screen.getByTestId("register-submit"))

    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy()
    expect(mockRegister).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("refuses a weak password and says which rule it broke", async () => {
    const screen = await renderRegister()

    await fill(screen, { password: "short" })
    await fireEvent.press(screen.getByTestId("register-submit"))

    expect(await screen.findByText("Password must be at least 12 characters.")).toBeTruthy()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it("refuses a username with characters the backend rejects", async () => {
    const screen = await renderRegister()

    await fill(screen, { username: "pad dler!" })
    await fireEvent.press(screen.getByTestId("register-submit"))

    expect(await screen.findByText("Only letters, numbers, and underscores.")).toBeTruthy()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it("ticks the password checklist as the password meets each rule", async () => {
    const screen = await renderRegister()
    expect(screen.queryAllByTestId("password-rule-met")).toHaveLength(0)

    await fireEvent.changeText(screen.getByTestId("register-password"), "abc")
    expect(screen.queryAllByTestId("password-rule-met")).toHaveLength(1)

    await fireEvent.changeText(screen.getByTestId("register-password"), VALID_PASSWORD)
    expect(screen.queryAllByTestId("password-rule-met")).toHaveLength(5)
  })

  it("shows the server's reason and stays on the form when sign-up fails", async () => {
    mockRegister.mockResolvedValue({ success: false, error: "Sign-ups are closed right now." })
    const screen = await renderRegister()

    await fill(screen, {})
    await fireEvent.press(screen.getByTestId("register-submit"))

    expect(await screen.findByText("Sign-ups are closed right now.")).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it("clears a stale server error when the form is submitted again", async () => {
    mockRegister.mockResolvedValueOnce({ success: false, error: "Something went wrong. Please try again." })
    const screen = await renderRegister()

    await fill(screen, {})
    await fireEvent.press(screen.getByTestId("register-submit"))
    await screen.findByText("Something went wrong. Please try again.")

    await fireEvent.press(screen.getByTestId("register-submit"))

    await waitFor(() => {
      expect(screen.queryByText("Something went wrong. Please try again.")).toBeNull()
    })
  })

  it("opens the terms and privacy pages in the browser", async () => {
    const screen = await renderRegister()

    await fireEvent.press(screen.getByTestId("register-terms"))
    await fireEvent.press(screen.getByTestId("register-privacy"))

    expect(Linking.openURL).toHaveBeenCalledWith(`${WEB_ORIGIN}/terms`)
    expect(Linking.openURL).toHaveBeenCalledWith(`${WEB_ORIGIN}/privacy`)
  })

  it("points the sign-in link at the login screen", async () => {
    const screen = await renderRegister()

    expect(screen.getByTestId("register-sign-in").props.accessibilityHint).toBe("/login")
  })
})
