// M9e WP0 spike (plans/M9e.md): reads the fix log the background task writes and boils it
// down to the numbers the spike has to report. Throwaway with the rest of lib/spike.

export type SpikeFix = {
  // The fix's own time (ms since epoch), from the GNSS chip.
  t: number
  // When the task received it (ms since epoch). A gap between the two means Android batched it.
  rx: number
  lat: number
  lon: number
  accuracyM: number | null
}

export type SpikeSummary = {
  count: number
  firstAt: number | null
  lastAt: number | null
  spanMs: number
  longestGapMs: number
  longestGapEndedAt: number | null
  medianGapMs: number
  gapsOverThreshold: number
  maxDeliveryDelayMs: number
}

export function parseLog(text: string): SpikeFix[] {
  const fixes: SpikeFix[] = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as Partial<SpikeFix>
      if (typeof parsed.t === "number" && typeof parsed.rx === "number") {
        fixes.push({
          t: parsed.t,
          rx: parsed.rx,
          lat: Number(parsed.lat),
          lon: Number(parsed.lon),
          accuracyM: parsed.accuracyM ?? null,
        })
      }
    } catch {
      // A line cut short by the process dying mid-write is itself a finding, not a crash.
    }
  }
  return fixes.sort((a, b) => a.t - b.t)
}

// One entry per launch of the app process (the task module writes one when it loads). More than
// one over a walk means Android killed the process and something brought it back.
export function parseProcessStarts(text: string): number[] {
  const starts: number[] = []
  for (const line of text.split("\n")) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as { start?: unknown }
      if (typeof parsed.start === "number") starts.push(parsed.start)
    } catch {
      // A cut-off line is not a start.
    }
  }
  return starts.sort((a, b) => a - b)
}

// `gapThresholdMs` is what counts as a missed beat: a few intervals, since a stationary kayak with
// a distance filter legitimately sends nothing.
export function summarise(fixes: SpikeFix[], gapThresholdMs: number): SpikeSummary {
  if (fixes.length === 0) {
    return {
      count: 0,
      firstAt: null,
      lastAt: null,
      spanMs: 0,
      longestGapMs: 0,
      longestGapEndedAt: null,
      medianGapMs: 0,
      gapsOverThreshold: 0,
      maxDeliveryDelayMs: 0,
    }
  }
  const gaps: number[] = []
  let longestGapMs = 0
  let longestGapEndedAt: number | null = null
  for (let index = 1; index < fixes.length; index += 1) {
    const gap = fixes[index].t - fixes[index - 1].t
    gaps.push(gap)
    if (gap > longestGapMs) {
      longestGapMs = gap
      longestGapEndedAt = fixes[index].t
    }
  }
  const sortedGaps = [...gaps].sort((a, b) => a - b)
  const medianGapMs = sortedGaps.length === 0 ? 0 : sortedGaps[Math.floor(sortedGaps.length / 2)]
  const firstAt = fixes[0].t
  const lastAt = fixes[fixes.length - 1].t
  return {
    count: fixes.length,
    firstAt,
    lastAt,
    spanMs: lastAt - firstAt,
    longestGapMs,
    longestGapEndedAt,
    medianGapMs,
    gapsOverThreshold: gaps.filter((gap) => gap > gapThresholdMs).length,
    maxDeliveryDelayMs: Math.max(...fixes.map((fix) => fix.rx - fix.t)),
  }
}
