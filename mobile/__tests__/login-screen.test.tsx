import { fireEvent, render, waitFor } from "@testing-library/react-native"
import { useLocalSearchParams } from "expo-router"
import { Alert, Linking, processColor } from "react-native"

import { palette } from "@shared/tokens"

import LoginScreen from "../app/(auth)/login"
import { WEB_ORIGIN } from "../lib/api/config"
import { DELETION_PENDING, INVALID_CREDENTIALS } from "../lib/auth/actions"
import { useAuth } from "../lib/auth/auth-context"
import {
  canUseBiometrics,
  clearBiometricCredentials,
  hasBiometricCredentials,
  readBiometricCredentials,
  saveBiometricCredentials,
} from "../lib/auth/biometric-store"
import { readRememberedMail, rememberMail } from "../lib/auth/remembered-mail"
import { WithCachedSurfaces } from "../test-utils/cached-surfaces"

jest.mock("expo-router", () => {
  const { cloneElement } = jest.requireActual("react")
  return {
    Redirect: () => null,
    // `Link asChild` hands its press to the child; here it only has to render it and say where it
    // points.
    Link: ({ children, href }: { children: React.ReactElement; href: string }) =>
      cloneElement(children, { accessibilityHint: href }),
    useLocalSearchParams: jest.fn(() => ({})),
    useRouter: () => ({ replace: jest.fn() }),
  }
})
jest.mock("../lib/auth/auth-context", () => ({
  useAuth: jest.fn(),
}))
jest.mock("../lib/auth/biometric-store", () => ({
  canUseBiometrics: jest.fn(),
  hasBiometricCredentials: jest.fn(),
  readBiometricCredentials: jest.fn(),
  saveBiometricCredentials: jest.fn(),
  clearBiometricCredentials: jest.fn(),
}))

jest.mock("../lib/auth/remembered-mail", () => ({
  readRememberedMail: jest.fn(),
  rememberMail: jest.fn(),
}))

const mockReadRememberedMail = readRememberedMail as jest.Mock
const mockRememberMail = rememberMail as jest.Mock
const mockUseAuth = useAuth as jest.Mock
const mockSearchParams = useLocalSearchParams as jest.Mock
const mockCanUseBiometrics = canUseBiometrics as jest.Mock
const mockHasCredentials = hasBiometricCredentials as jest.Mock
const mockReadCredentials = readBiometricCredentials as jest.Mock
const mockSaveCredentials = saveBiometricCredentials as jest.Mock
const mockClearCredentials = clearBiometricCredentials as jest.Mock

function signedOut(signIn: jest.Mock = jest.fn()) {
  mockUseAuth.mockReturnValue({ status: "unauthenticated", signIn, signOut: jest.fn() })
  return signIn
}

async function renderLogin() {
  return render(<LoginScreen />, { wrapper: WithCachedSurfaces })
}

async function fillAndSubmit(
  screen: Awaited<ReturnType<typeof renderLogin>>,
  mail: string,
  password: string,
) {
  await fireEvent.changeText(screen.getByTestId("login-email"), mail)
  await fireEvent.changeText(screen.getByTestId("login-password"), password)
  await fireEvent.press(screen.getByTestId("login-submit"))
}

describe("LoginScreen", () => {
  let openURL: jest.SpyInstance
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    mockUseAuth.mockReset()
    mockSearchParams.mockReturnValue({})
    mockCanUseBiometrics.mockReturnValue(false)
    mockHasCredentials.mockResolvedValue(false)
    mockReadCredentials.mockReset()
    mockReadRememberedMail.mockReset().mockResolvedValue("")
    mockRememberMail.mockReset().mockResolvedValue(undefined)
    mockSaveCredentials.mockReset().mockResolvedValue(undefined)
    mockClearCredentials.mockReset().mockResolvedValue(undefined)
    openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("submits the entered credentials to signIn", async () => {
    const signIn = signedOut(jest.fn().mockResolvedValue({ success: true }))
    const screen = await renderLogin()

    await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("paddler@example.com", "correct-horse")
    })
  })

  it("fills in the address used last time, leaving only the password to type", async () => {
    mockReadRememberedMail.mockResolvedValue("paddler@example.com")
    signedOut()
    const screen = await renderLogin()

    await waitFor(() => {
      expect(screen.getByTestId("login-email").props.value).toBe("paddler@example.com")
    })
    expect(screen.getByTestId("login-password").props.value).toBe("")
  })

  it("keeps what was typed when the remembered address arrives late", async () => {
    let deliver: (mail: string) => void = () => undefined
    mockReadRememberedMail.mockReturnValue(new Promise<string>((resolve) => (deliver = resolve)))
    signedOut()
    const screen = await renderLogin()

    await fireEvent.changeText(screen.getByTestId("login-email"), "other@example.com")
    deliver("paddler@example.com")

    await waitFor(() => expect(mockReadRememberedMail).toHaveBeenCalled())
    expect(screen.getByTestId("login-email").props.value).toBe("other@example.com")
  })

  it("remembers the address after a sign-in that worked", async () => {
    signedOut(jest.fn().mockResolvedValue({ success: true }))
    const screen = await renderLogin()

    await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

    await waitFor(() => expect(mockRememberMail).toHaveBeenCalledWith("paddler@example.com"))
  })

  it("does not remember an address whose sign-in was refused", async () => {
    signedOut(jest.fn().mockResolvedValue({ success: false, error: "Invalid email or password." }))
    const screen = await renderLogin()

    await fillAndSubmit(screen, "paddler@example.com", "wrong")

    await screen.findByText("Invalid email or password.")
    expect(mockRememberMail).not.toHaveBeenCalled()
  })

  it("shows the server's error message on a failed sign-in, not a generic fallback", async () => {
    signedOut(
      jest.fn().mockResolvedValue({ success: false, error: "Invalid email or password." }),
    )
    const screen = await renderLogin()

    await fillAndSubmit(screen, "paddler@example.com", "wrong")

    expect(await screen.findByText("Invalid email or password.")).toBeTruthy()
  })

  it("rejects a malformed email on the phone, without a request", async () => {
    const signIn = signedOut()
    const screen = await renderLogin()

    await fillAndSubmit(screen, "not-an-email", "correct-horse")

    expect(await screen.findByText("Enter a valid email address.")).toBeTruthy()
    expect(signIn).not.toHaveBeenCalled()
  })

  it("rejects an empty password on the phone, without a request", async () => {
    const signIn = signedOut()
    const screen = await renderLogin()

    await fillAndSubmit(screen, "paddler@example.com", "")

    expect(await screen.findByText("Password is required.")).toBeTruthy()
    expect(signIn).not.toHaveBeenCalled()
  })

  it("trims the address, which a keyboard's suggestion bar often leaves a space on", async () => {
    const signIn = signedOut(jest.fn().mockResolvedValue({ success: true }))
    const screen = await renderLogin()

    await fillAndSubmit(screen, "  paddler@example.com ", "correct-horse")

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("paddler@example.com", "correct-horse")
    })
  })

  it("hides the password until the eye is pressed, then hides it again", async () => {
    signedOut()
    const screen = await renderLogin()
    const field = screen.getByTestId("login-password")
    expect(field.props.secureTextEntry).toBe(true)

    await fireEvent.press(screen.getByTestId("login-password-toggle"))
    expect(screen.getByTestId("login-password").props.secureTextEntry).toBe(false)

    await fireEvent.press(screen.getByTestId("login-password-toggle"))
    expect(screen.getByTestId("login-password").props.secureTextEntry).toBe(true)
  })

  it("sends a forgotten password to the web page for it", async () => {
    signedOut()
    const screen = await renderLogin()

    await fireEvent.press(screen.getByTestId("login-forgot-password"))

    expect(openURL).toHaveBeenCalledWith(`${WEB_ORIGIN}/forgot-password`)
  })

  it("points the create-account link at the register screen", async () => {
    signedOut()
    const screen = await renderLogin()

    expect(screen.getByTestId("login-create-account").props.accessibilityHint).toBe("/register")
  })

  it("tells a visitor from the register screen to verify their email", async () => {
    mockSearchParams.mockReturnValue({ registered: "1" })
    signedOut()
    const screen = await renderLogin()

    expect(screen.getByText("Account created — check your email to verify before signing in.")).toBeTruthy()
  })

  it("shows no verification notice on an ordinary visit", async () => {
    signedOut()
    const screen = await renderLogin()

    expect(screen.queryByTestId("login-registered-notice")).toBeNull()
  })

  it("explains a scheduled deletion and links to the page that cancels it", async () => {
    signedOut(
      jest.fn().mockResolvedValue({
        success: false,
        error: "This account is scheduled for deletion.",
        code: DELETION_PENDING,
      }),
    )
    const screen = await renderLogin()

    await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

    expect(await screen.findByTestId("login-deletion-pending")).toBeTruthy()
    await fireEvent.press(screen.getByTestId("login-cancel-deletion"))
    expect(openURL).toHaveBeenCalledWith(`${WEB_ORIGIN}/cancel-deletion`)
  })

  describe("fingerprint shortcut", () => {
    it("offers to save the credentials after a password sign-in on a phone with a fingerprint", async () => {
      mockCanUseBiometrics.mockReturnValue(true)
      signedOut(jest.fn().mockResolvedValue({ success: true }))
      const screen = await renderLogin()

      await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

      await waitFor(() => expect(alertSpy).toHaveBeenCalled())
      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[]
      // Nothing is stored until the user says yes.
      expect(mockSaveCredentials).not.toHaveBeenCalled()

      buttons.find((button) => button.text === "Use fingerprint")?.onPress?.()

      expect(mockSaveCredentials).toHaveBeenCalledWith({
        mail: "paddler@example.com",
        password: "correct-horse",
      })
    })

    it("stores nothing when the offer is declined", async () => {
      mockCanUseBiometrics.mockReturnValue(true)
      signedOut(jest.fn().mockResolvedValue({ success: true }))
      const screen = await renderLogin()

      await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

      await waitFor(() => expect(alertSpy).toHaveBeenCalled())
      const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[]
      buttons.find((button) => button.text === "Not now")?.onPress?.()

      expect(mockSaveCredentials).not.toHaveBeenCalled()
    })

    it("does not offer on a phone with no usable fingerprint", async () => {
      mockCanUseBiometrics.mockReturnValue(false)
      const signIn = signedOut(jest.fn().mockResolvedValue({ success: true }))
      const screen = await renderLogin()

      await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

      await waitFor(() => expect(signIn).toHaveBeenCalled())
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("does not offer again once the credentials are saved", async () => {
      mockCanUseBiometrics.mockReturnValue(true)
      mockHasCredentials.mockResolvedValue(true)
      const signIn = signedOut(jest.fn().mockResolvedValue({ success: true }))
      const screen = await renderLogin()
      await screen.findByTestId("login-fingerprint")

      await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

      await waitFor(() => expect(signIn).toHaveBeenCalled())
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("does not offer after a failed sign-in", async () => {
      mockCanUseBiometrics.mockReturnValue(true)
      signedOut(jest.fn().mockResolvedValue({ success: false, error: "Invalid email or password." }))
      const screen = await renderLogin()

      await fillAndSubmit(screen, "paddler@example.com", "wrong")

      await screen.findByText("Invalid email or password.")
      expect(alertSpy).not.toHaveBeenCalled()
    })

    it("shows no fingerprint button until credentials are saved", async () => {
      signedOut()
      const screen = await renderLogin()

      await waitFor(() => expect(mockHasCredentials).toHaveBeenCalled())
      expect(screen.queryByTestId("login-fingerprint")).toBeNull()
    })

    it("signs in with the saved credentials after the fingerprint check", async () => {
      mockHasCredentials.mockResolvedValue(true)
      mockReadCredentials.mockResolvedValue({ mail: "paddler@example.com", password: "correct-horse" })
      const signIn = signedOut(jest.fn().mockResolvedValue({ success: true }))
      const screen = await renderLogin()

      await fireEvent.press(await screen.findByTestId("login-fingerprint"))

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith("paddler@example.com", "correct-horse")
      })
    })

    it("falls back to the password form when the fingerprint check is cancelled", async () => {
      mockHasCredentials.mockResolvedValue(true)
      mockReadCredentials.mockResolvedValue(null)
      const signIn = signedOut()
      const screen = await renderLogin()

      await fireEvent.press(await screen.findByTestId("login-fingerprint"))

      await waitFor(() => expect(mockReadCredentials).toHaveBeenCalled())
      expect(signIn).not.toHaveBeenCalled()
      expect(screen.queryByText("Your saved password is out of date. Sign in with your password.")).toBeNull()
      expect(screen.getByTestId("login-fingerprint")).toBeTruthy()
    })

    it("drops a saved password the server no longer accepts, and says why", async () => {
      mockHasCredentials.mockResolvedValue(true)
      mockReadCredentials.mockResolvedValue({ mail: "paddler@example.com", password: "old" })
      signedOut(
        jest.fn().mockResolvedValue({
          success: false,
          error: "Invalid email or password.",
          code: INVALID_CREDENTIALS,
        }),
      )
      const screen = await renderLogin()

      await fireEvent.press(await screen.findByTestId("login-fingerprint"))

      expect(
        await screen.findByText("Your saved password is out of date. Sign in with your password."),
      ).toBeTruthy()
      expect(mockClearCredentials).toHaveBeenCalled()
      // The shortcut goes with the credentials it unlocked.
      expect(screen.queryByTestId("login-fingerprint")).toBeNull()
    })

    it("keeps the saved password when the failure is the network, not the password", async () => {
      mockHasCredentials.mockResolvedValue(true)
      mockReadCredentials.mockResolvedValue({ mail: "paddler@example.com", password: "correct-horse" })
      signedOut(
        jest.fn().mockResolvedValue({
          success: false,
          error: "Could not reach the server. Please try again.",
        }),
      )
      const screen = await renderLogin()

      await fireEvent.press(await screen.findByTestId("login-fingerprint"))

      expect(await screen.findByText("Could not reach the server. Please try again.")).toBeTruthy()
      expect(mockClearCredentials).not.toHaveBeenCalled()
      expect(screen.getByTestId("login-fingerprint")).toBeTruthy()
    })
  })

  describe("hero backdrop", () => {
    beforeEach(() => {
      signedOut()
    })

    it("renders the ocean hero behind the form", async () => {
      const { getByTestId } = await renderLogin()

      expect(getByTestId("auth-hero")).toBeTruthy()
    })

    it("draws the watermark in a single ink so it cannot compete with the form", async () => {
      const { getByTestId } = await renderLogin()
      const watermark = getByTestId("auth-hero-watermark")

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
      const signIn = signedOut(jest.fn().mockResolvedValue({ success: true }))
      const screen = await renderLogin()

      await fillAndSubmit(screen, "paddler@example.com", "correct-horse")

      await waitFor(() => {
        expect(signIn).toHaveBeenCalledWith("paddler@example.com", "correct-horse")
      })
    })
  })
})
