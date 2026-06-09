import { describe, it, expect } from "vitest"
import {
  knotsToBeaufort,
  beaufortLabel,
  beaufortSeverity,
  waveHeightSeverity,
  degreesToCompass,
} from "../beaufort"

describe("knotsToBeaufort", () => {
  it("returns B0 for calm (< 1 kn)", () => {
    expect(knotsToBeaufort(0)).toBe(0)
    expect(knotsToBeaufort(0.9)).toBe(0)
  })

  it("returns B3 for gentle breeze (7–10 kn)", () => {
    expect(knotsToBeaufort(7)).toBe(3)
    expect(knotsToBeaufort(10)).toBe(3)
  })

  it("returns B4 for moderate breeze (11–16 kn)", () => {
    expect(knotsToBeaufort(11)).toBe(4)
    expect(knotsToBeaufort(16)).toBe(4)
  })

  it("returns B6 for strong breeze (22–27 kn)", () => {
    expect(knotsToBeaufort(22)).toBe(6)
    expect(knotsToBeaufort(27)).toBe(6)
  })

  it("returns B8 for gale (34–40 kn)", () => {
    expect(knotsToBeaufort(34)).toBe(8)
    expect(knotsToBeaufort(40)).toBe(8)
  })

  it("returns B12 for hurricane force (≥ 64 kn)", () => {
    expect(knotsToBeaufort(64)).toBe(12)
    expect(knotsToBeaufort(100)).toBe(12)
  })
})

describe("beaufortLabel", () => {
  it("returns Calm for B0", () => expect(beaufortLabel(0)).toBe("Calm"))
  it("returns Fresh breeze for B5", () => expect(beaufortLabel(5)).toBe("Fresh breeze"))
  it("returns Gale for B8", () => expect(beaufortLabel(8)).toBe("Gale"))
  it("returns Hurricane for B12", () => expect(beaufortLabel(12)).toBe("Hurricane"))
})

describe("beaufortSeverity", () => {
  it("calm for B0–B3", () => {
    expect(beaufortSeverity(0)).toBe("calm")
    expect(beaufortSeverity(3)).toBe("calm")
  })

  it("moderate for B4–B5", () => {
    expect(beaufortSeverity(4)).toBe("moderate")
    expect(beaufortSeverity(5)).toBe("moderate")
  })

  it("strong for B6–B7", () => {
    expect(beaufortSeverity(6)).toBe("strong")
    expect(beaufortSeverity(7)).toBe("strong")
  })

  it("gale for B8 and above", () => {
    expect(beaufortSeverity(8)).toBe("gale")
    expect(beaufortSeverity(12)).toBe("gale")
  })
})

describe("waveHeightSeverity", () => {
  it("calm below 0.5 m", () => expect(waveHeightSeverity(0.4)).toBe("calm"))
  it("moderate at 0.5–1.5 m", () => {
    expect(waveHeightSeverity(0.5)).toBe("moderate")
    expect(waveHeightSeverity(1.5)).toBe("moderate")
  })
  it("rough at 1.5–2.5 m", () => {
    expect(waveHeightSeverity(1.51)).toBe("rough")
    expect(waveHeightSeverity(2.5)).toBe("rough")
  })
  it("high above 2.5 m", () => expect(waveHeightSeverity(2.51)).toBe("high"))
})

describe("degreesToCompass", () => {
  it("returns N at 0°", () => expect(degreesToCompass(0)).toBe("N"))
  it("returns N at 360°", () => expect(degreesToCompass(360)).toBe("N"))
  it("returns NE at 45°", () => expect(degreesToCompass(45)).toBe("NE"))
  it("returns E at 90°", () => expect(degreesToCompass(90)).toBe("E"))
  it("returns SW at 225°", () => expect(degreesToCompass(225)).toBe("SW"))
  it("returns SW at 247° (rounds to nearest)", () => expect(degreesToCompass(247)).toBe("SW"))
  it("returns W at 270°", () => expect(degreesToCompass(270)).toBe("W"))
})
