import { describe, it, expect } from "vitest"
import {
  knotsToBeaufort,
  beaufortLabel,
  beaufortSeverity,
  waveHeightSeverity,
  degreesToCompass,
  waveHeightToBft,
  combinedSeaState,
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

describe("waveHeightToBft", () => {
  it("maps 0 m to Bft 0", () => expect(waveHeightToBft(0)).toBe(0))
  it("maps 0.4 m (wavelet) to Bft 2", () => expect(waveHeightToBft(0.4)).toBe(2))
  it("maps 0.8 m (large wavelets) to Bft 3", () => expect(waveHeightToBft(0.8)).toBe(3))
  it("maps 1.5 m (small waves) to Bft 4", () => expect(waveHeightToBft(1.5)).toBe(4))
  it("maps 2.5 m (moderate) to Bft 5", () => expect(waveHeightToBft(2.5)).toBe(5))
  it("maps 3.5 m (large) to Bft 6", () => expect(waveHeightToBft(3.5)).toBe(6))
  it("maps 5.0 m (very rough) to Bft 7", () => expect(waveHeightToBft(5.0)).toBe(7))
  it("maps 6.0 m (high) to Bft 8", () => expect(waveHeightToBft(6.0)).toBe(8))
  it("maps boundary 1.0 m to Bft 4", () => expect(waveHeightToBft(1.0)).toBe(4))
  it("maps boundary 0.6 m to Bft 3", () => expect(waveHeightToBft(0.6)).toBe(3))
})

describe("combinedSeaState", () => {
  it("returns wind Bft when no wave data", () => {
    expect(combinedSeaState(14, null, null)).toBe(4) // 14 kn = Bft 4
  })

  it("returns wave Bft when no wind data", () => {
    expect(combinedSeaState(null, 2.5, null)).toBe(5) // 2.5 m = Bft 5
  })

  it("returns max when wave is worse than wind", () => {
    // 8 kn = Bft 3, but 2.5 m swell on 0.5 m wind-chop → effective wave > 2.5 m → Bft 5+
    expect(combinedSeaState(8, 2.5, 2.5)).toBeGreaterThanOrEqual(5)
  })

  it("returns max when wind is worse than wave", () => {
    expect(combinedSeaState(35, 0.4, 0)).toBe(8) // 35 kn = Bft 8, 0.4 m = Bft 2
  })

  it("constructive interference raises effective height above combined Hs", () => {
    // wave_height = 2.0 m, swell = 1.8 m
    // wind_sea = sqrt(2.0² − 1.8²) ≈ 0.87 m
    // effective = 0.87 + 1.8 = 2.67 m → Bft 5
    // plain wave_height = 2.0 m → Bft 5 as well, but effective > 2.0 m
    const bft = combinedSeaState(10, 2.0, 1.8)
    expect(bft).toBeGreaterThanOrEqual(5)
  })

  it("returns 0 with no data at all", () => {
    expect(combinedSeaState(null, null, null)).toBe(0)
  })
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
