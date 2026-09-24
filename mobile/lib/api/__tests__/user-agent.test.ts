import { Platform } from "react-native"

import { appUserAgent } from "../user-agent"

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.0.12" } },
}))

describe("appUserAgent", () => {
  const realOS = Platform.OS
  const realVersion = Platform.Version

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { value: realOS, configurable: true })
    Object.defineProperty(Platform, "Version", { value: realVersion, configurable: true })
  })

  function asPlatform(os: string, version: string | number, model?: string) {
    Object.defineProperty(Platform, "OS", { value: os, configurable: true })
    Object.defineProperty(Platform, "Version", { value: version, configurable: true })
    Object.defineProperty(Platform, "constants", {
      value: model ? { Model: model } : {},
      configurable: true,
    })
  }

  it("names the app and the phone, so a session row is recognisable", () => {
    // React Native's default is okhttp/…, which matches nothing the backend looks for, so
    // every phone showed as "Unknown device" in the list meant to answer "was that me?".
    asPlatform("android", 34, "Pixel 8")

    expect(appUserAgent()).toBe("Kayaktrek/1.0.12 (Android 34; Pixel 8)")
  })

  it("still identifies the app when the model is unavailable", () => {
    asPlatform("android", 34)

    expect(appUserAgent()).toBe("Kayaktrek/1.0.12 (Android 34)")
  })

  it("uses the OS name on iOS, which exposes no model to apps", () => {
    asPlatform("ios", "18.0")

    expect(appUserAgent()).toBe("Kayaktrek/1.0.12 (iOS 18.0)")
  })

  it("carries the app version the backend will show alongside the device", () => {
    asPlatform("android", 34, "Pixel 8")

    expect(appUserAgent()).toContain("Kayaktrek/1.0.12")
  })
})
