import { View } from "react-native"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { WIND_SPEED_COLORS, windLegendLabels } from "@shared/weather/wind-scale"

import { Text } from "../ui/text"

// The wind colour scale as a left-to-right bar, calm to strong. Web draws the same bar with a CSS
// gradient (layers-control.tsx); here it is an SVG gradient over the same stops, so the swatch on
// the Wind switch and the legend under the switches both come from lib/weather/wind-scale.ts.
export function WindGradient({
  id,
  height,
  width = "100%",
  radius = 0,
}: {
  /** Distinct per instance on screen: the gradient is referenced by id. */
  id: string
  height: number
  width?: number | `${number}%`
  radius?: number
}) {
  const last = WIND_SPEED_COLORS.length - 1
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          {WIND_SPEED_COLORS.map((color, index) => (
            <Stop key={color} offset={index / last} stopColor={color} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" rx={radius} fill={`url(#${id})`} />
    </Svg>
  )
}

export function WindLegend() {
  return (
    <View testID="wind-legend" className="border-t border-border/20 px-3 pb-2 pt-1.5">
      <Text className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        Wind speed
      </Text>
      <WindGradient id="wind-legend-bar" height={10} radius={2} />
      <View className="mt-0.5 flex-row justify-between">
        {windLegendLabels().map((label) => (
          <Text key={label} className="text-[8px] text-muted-foreground">
            {label}
          </Text>
        ))}
      </View>
    </View>
  )
}
