import { describe, it, expect } from "vitest"
import {
  WIND_COLOR_OPTIONS,
  WIND_SPEED_COLORS,
  WIND_SPEED_MAX_MS,
  WIND_SPEED_MIN_MS,
  windSpeedColor,
  windLegendGradient,
  windLegendLabels,
} from "../wind-scale"

describe("windSpeedColor", () => {
  it("is the calm end of the scale at 0 m/s and the gale end at the top of the window", () => {
    expect(windSpeedColor(0)).toBe(WIND_SPEED_COLORS[0])
    expect(windSpeedColor(WIND_SPEED_MAX_MS)).toBe(WIND_SPEED_COLORS[WIND_SPEED_COLORS.length - 1])
  })

  it("clamps rather than running off either end", () => {
    expect(windSpeedColor(-3)).toBe(WIND_SPEED_COLORS[0])
    expect(windSpeedColor(WIND_SPEED_MAX_MS * 4)).toBe(
      WIND_SPEED_COLORS[WIND_SPEED_COLORS.length - 1],
    )
  })

  it("steps to the nearest colour, the way leaflet-velocity indexes its scale", () => {
    const last = WIND_SPEED_COLORS.length - 1
    expect(windSpeedColor(WIND_SPEED_MAX_MS / 2)).toBe(WIND_SPEED_COLORS[Math.round(last / 2)])
    const halfStep = WIND_SPEED_MAX_MS / last / 2
    expect(windSpeedColor(halfStep - 0.01)).toBe(WIND_SPEED_COLORS[0])
    expect(windSpeedColor(halfStep + 0.01)).toBe(WIND_SPEED_COLORS[1])
  })

  it("never returns a colour outside the scale", () => {
    for (let speed = -2; speed <= WIND_SPEED_MAX_MS * 2; speed += 0.25) {
      expect(WIND_SPEED_COLORS).toContain(windSpeedColor(speed))
    }
  })
})

describe("WIND_COLOR_OPTIONS", () => {
  it("hands leaflet-velocity the same colours and the same window the legend describes", () => {
    expect(WIND_COLOR_OPTIONS).toEqual({
      colorScale: [...WIND_SPEED_COLORS],
      minVelocity: WIND_SPEED_MIN_MS,
      maxVelocity: WIND_SPEED_MAX_MS,
    })
    expect(windLegendLabels()[2]).toBe(`${WIND_COLOR_OPTIONS.maxVelocity}+ m/s`)
  })
})

describe("the legend", () => {
  it("spans exactly the window the particles are coloured over, so it cannot say one thing while the map shows another", () => {
    const labels = windLegendLabels()

    expect(labels).toEqual(["0", String(WIND_SPEED_MAX_MS / 2), `${WIND_SPEED_MAX_MS}+ m/s`])
  })

  it("is a left-to-right gradient through every colour of the scale, in order", () => {
    expect(windLegendGradient()).toBe(`linear-gradient(to right, ${WIND_SPEED_COLORS.join(", ")})`)
  })
})
