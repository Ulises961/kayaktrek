"use client"

import { useState } from "react"
import {
  X,
  Cloud,
  Waves,
  Navigation,
  Wind,
  ChevronRight,
  Anchor,
  Eye,
  CircleDot,
  Droplets,
  Thermometer,
  Clock,
  SlidersHorizontal,
  ChevronLeft,
  ImageIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Mock data ─────────────────────────────────────────────────────────────────

const DAYS = [
  { id: "d1", day: 1, date: "Jun 15", hasWeather: true, hasSea: true, pointCount: 5 },
  { id: "d2", day: 2, date: "Jun 16", hasWeather: true, hasSea: true, pointCount: 3 },
  { id: "d3", day: 3, date: "Jun 17", hasWeather: false, hasSea: false, pointCount: 4 },
  { id: "d4", day: 4, date: "Jun 18", hasWeather: false, hasSea: false, pointCount: 2 },
  { id: "d5", day: 5, date: "Jun 19", hasWeather: false, hasSea: false, pointCount: 6 },
]

const WEATHER: Record<
  string,
  { wind: string; dir: string; temp: string; cloud: string; rain: string }
> = {
  d1: { wind: "14 kn", dir: "NW", temp: "11°C", cloud: "Partly cloudy", rain: "0 mm" },
  d2: { wind: "8 kn", dir: "W", temp: "13°C", cloud: "Overcast", rain: "1.2 mm" },
}

const SEA: Record<
  string,
  { waveH: string; waveP: string; waveDir: string; swellH: string; current: string }
> = {
  d1: { waveH: "0.8 m", waveP: "7 s", waveDir: "NW", swellH: "1.1 m", current: "0.4 kn" },
  d2: { waveH: "1.4 m", waveP: "9 s", waveDir: "W", swellH: "1.8 m", current: "0.6 kn" },
}

type PType = "stop" | "position" | "interest"

type MockPoint = {
  id: string
  name: string
  type: PType
  dist: string
  lat: number
  lon: number
  imageCount: number
}

const POINTS: Record<string, MockPoint[]> = {
  d1: [
    {
      id: "p1",
      name: "Å i Lofoten",
      type: "stop",
      dist: "start",
      lat: 67.878,
      lon: 12.973,
      imageCount: 4,
    },
    {
      id: "p2",
      name: "Utakleiv Beach",
      type: "position",
      dist: "8.4 nm",
      lat: 68.032,
      lon: 13.421,
      imageCount: 0,
    },
    {
      id: "p3",
      name: "Vikten Sea Caves",
      type: "interest",
      dist: "12.1 nm",
      lat: 68.071,
      lon: 13.512,
      imageCount: 7,
    },
    {
      id: "p4",
      name: "Eggum",
      type: "position",
      dist: "18.3 nm",
      lat: 68.141,
      lon: 13.653,
      imageCount: 2,
    },
    {
      id: "p5",
      name: "Stamsund",
      type: "stop",
      dist: "24.7 nm",
      lat: 68.121,
      lon: 13.843,
      imageCount: 1,
    },
  ],
  d2: [
    {
      id: "p6",
      name: "Stamsund",
      type: "stop",
      dist: "start",
      lat: 68.121,
      lon: 13.843,
      imageCount: 1,
    },
    {
      id: "p7",
      name: "Leknes passage",
      type: "position",
      dist: "6.2 nm",
      lat: 68.143,
      lon: 13.612,
      imageCount: 0,
    },
    {
      id: "p8",
      name: "Ballstad",
      type: "stop",
      dist: "11.8 nm",
      lat: 68.072,
      lon: 13.562,
      imageCount: 3,
    },
  ],
  d3: [
    {
      id: "p9",
      name: "Ballstad",
      type: "stop",
      dist: "start",
      lat: 68.072,
      lon: 13.562,
      imageCount: 3,
    },
    {
      id: "p10",
      name: "Nusfjord outlook",
      type: "interest",
      dist: "4.3 nm",
      lat: 68.032,
      lon: 13.362,
      imageCount: 5,
    },
    {
      id: "p11",
      name: "Nusfjord",
      type: "stop",
      dist: "9.1 nm",
      lat: 68.011,
      lon: 13.323,
      imageCount: 2,
    },
    {
      id: "p12",
      name: "Flakstad Beach",
      type: "position",
      dist: "14.6 nm",
      lat: 67.983,
      lon: 13.271,
      imageCount: 0,
    },
  ],
  d4: [
    {
      id: "p13",
      name: "Flakstad",
      type: "stop",
      dist: "start",
      lat: 67.983,
      lon: 13.271,
      imageCount: 0,
    },
    {
      id: "p14",
      name: "Ramberg",
      type: "stop",
      dist: "7.2 nm",
      lat: 68.081,
      lon: 13.191,
      imageCount: 1,
    },
  ],
  d5: [
    {
      id: "p15",
      name: "Ramberg",
      type: "stop",
      dist: "start",
      lat: 68.081,
      lon: 13.191,
      imageCount: 1,
    },
    {
      id: "p16",
      name: "Fredvang Bridges",
      type: "interest",
      dist: "5.1 nm",
      lat: 67.921,
      lon: 13.121,
      imageCount: 6,
    },
    {
      id: "p17",
      name: "Tind",
      type: "position",
      dist: "9.3 nm",
      lat: 67.881,
      lon: 13.052,
      imageCount: 0,
    },
    {
      id: "p18",
      name: "Reine",
      type: "stop",
      dist: "13.7 nm",
      lat: 67.932,
      lon: 13.083,
      imageCount: 8,
    },
    {
      id: "p19",
      name: "Hamnøy viewpoint",
      type: "interest",
      dist: "16.2 nm",
      lat: 67.921,
      lon: 13.062,
      imageCount: 3,
    },
    {
      id: "p20",
      name: "Sakrisøy",
      type: "stop",
      dist: "18.9 nm",
      lat: 67.913,
      lon: 13.043,
      imageCount: 0,
    },
  ],
}

function fmtCoord(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}`
  const lonStr = `${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`
  return `${latStr} · ${lonStr}`
}

function windKnToBft(kn: number): number {
  if (kn < 1) return 0
  if (kn < 4) return 1
  if (kn < 7) return 2
  if (kn < 11) return 3
  if (kn < 17) return 4
  if (kn < 22) return 5
  if (kn < 28) return 6
  if (kn < 34) return 7
  if (kn < 41) return 8
  if (kn < 48) return 9
  if (kn < 56) return 10
  if (kn < 64) return 11
  return 12
}

function bftPillClasses(bft: number | null, active: boolean): string {
  if (active) return "bg-white/20 text-white"
  if (bft === null) return "bg-muted/50 text-muted-foreground/50"
  if (bft <= 3) return "bg-green-500/15 text-green-700 dark:text-green-400"
  if (bft <= 5) return "bg-amber-500/15 text-amber-700 dark:text-amber-400"
  if (bft <= 7) return "bg-orange-500/15 text-orange-700 dark:text-orange-400"
  return "bg-red-500/15 text-red-700 dark:text-red-400"
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PIcon({ type }: { type: PType }) {
  if (type === "stop") return <Anchor className="text-primary size-3 shrink-0" />
  if (type === "interest") return <Eye className="size-3 shrink-0 text-[var(--accent,#f97316)]" />
  return <CircleDot className="text-muted-foreground size-2.5 shrink-0 fill-current" />
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/20 flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span className="font-mono text-[11px] font-medium">{value}</span>
    </div>
  )
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <Icon className="text-muted-foreground/30 size-6" />
      <p className="text-muted-foreground text-[11px]">{message}</p>
    </div>
  )
}

// ── Wireframe ─────────────────────────────────────────────────────────────────

type Tab = "route" | "forecast" | "tides"

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "route", label: "Route", Icon: Navigation },
  { id: "forecast", label: "Forecast", Icon: Cloud },
  { id: "tides", label: "Tides", Icon: Waves },
]

type TidalGate = { name: string; slack: string; note: string }
type TidalData = {
  source: "station" | "manual"
  hwTime: string
  hwHeight: string
  coefficient: number
  gates: TidalGate[]
}

const TIDES: Record<string, TidalData> = {
  d1: {
    source: "station",
    hwTime: "14:32",
    hwHeight: "4.8",
    coefficient: 0.72,
    gates: [
      { name: "Å narrows", slack: "14:15", note: "HW −17 min" },
      { name: "Gimsøystraumen", slack: "16:40", note: "HW +2 h 08 min" },
      { name: "Sundstraumen exit", slack: "18:55", note: "HW +4 h 23 min" },
    ],
  },
  d2: {
    source: "manual",
    hwTime: "15:10",
    hwHeight: "4.2",
    coefficient: 0.61,
    gates: [{ name: "Leknes passage", slack: "15:05", note: "HW −5 min" }],
  },
}

const STRIP_W = 112 // px — day strip width
const DRAWER_W = 264 // px — feature drawer width

export function ItineraryLayoutWireframe() {
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>("route")
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [hour, setHour] = useState(12)
  const [detailOpen, setDetailOpen] = useState(false)
  const [imageIdx, setImageIdx] = useState(0)

  const selectedDay = DAYS.find((d) => d.id === selectedDayId) ?? null
  const drawerOpen = selectedDay !== null
  const weather = selectedDayId ? WEATHER[selectedDayId] : null
  const sea = selectedDayId ? SEA[selectedDayId] : null
  const tidal = selectedDayId ? TIDES[selectedDayId] : null
  const points = selectedDayId ? (POINTS[selectedDayId] ?? []) : []
  const selectedPoint = selectedPointId ? points.find((p) => p.id === selectedPointId) : null

  // Local tidal param overrides (wireframe: editable but not persisted)
  const [tidalSource, setTidalSource] = useState<"station" | "manual">(tidal?.source ?? "manual")
  const [hwTime, setHwTime] = useState(tidal?.hwTime ?? "")
  const [hwHeight, setHwHeight] = useState(tidal?.hwHeight ?? "")
  const [coefficient, setCoefficient] = useState(tidal?.coefficient ?? 0.7)

  function pickDay(id: string) {
    if (selectedDayId === id) {
      setSelectedDayId(null)
      setSelectedPointId(null)
    } else {
      setSelectedDayId(id)
      setSelectedPointId(null)
      setActiveTab("route")
    }
  }

  return (
    <div className="border-border relative h-[500px] overflow-hidden rounded-xl border">
      {/* ── Map placeholder ───────────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(155deg, #b5ceda 0%, #8db4c6 35%, #6a9db5 65%, #568da6 100%)",
        }}
      >
        {/* lat/lon grid */}
        <svg className="absolute inset-0 h-full w-full opacity-[0.07]">
          <defs>
            <pattern id="wf-grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#wf-grid)" />
        </svg>
        {/* Fake route */}
        <svg className="absolute inset-0 h-full w-full">
          <polyline
            points="130,420 190,340 250,280 320,240 390,215 450,220 510,190 570,170"
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="2"
            strokeDasharray="7 3"
          />
          {[
            [130, 420],
            [320, 240],
            [510, 190],
          ].map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="5"
              fill="white"
              stroke="rgba(0,0,0,0.15)"
              strokeWidth="1.5"
            />
          ))}
        </svg>
        <span className="absolute right-2 bottom-2 font-mono text-[9px] text-white/25">
          map placeholder — Lofoten Archipelago
        </span>
      </div>

      {/* ── Day strip (left vertical rail) ────────────────────────────────── */}
      <div
        className="border-border/30 bg-card/85 absolute top-0 bottom-0 left-0 z-10 flex flex-col overflow-y-auto border-r backdrop-blur-md"
        style={{ width: STRIP_W }}
      >
        <div className="border-border/20 border-b px-2.5 py-2.5">
          <p className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
            Lofoten
          </p>
          <p className="text-muted-foreground mt-0.5 text-[10px]">5 days</p>
        </div>

        <div className="flex flex-col gap-0.5 p-1.5">
          {DAYS.map((day) => {
            const active = day.id === selectedDayId
            return (
              <button
                key={day.id}
                onClick={() => pickDay(day.id)}
                className={cn(
                  "w-full rounded-lg px-2 py-2.5 text-left transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "text-[10px] font-bold",
                      active ? "text-primary-foreground" : "text-foreground",
                    )}
                  >
                    Day {day.day}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[9px]",
                      active ? "text-primary-foreground/70" : "text-muted-foreground",
                    )}
                  >
                    {day.date}
                  </span>
                </div>
                {/* Bft pill + point count */}
                {(() => {
                  const w = WEATHER[day.id]
                  const bft = w ? windKnToBft(parseInt(w.wind, 10)) : null
                  return (
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold",
                          bftPillClasses(bft, active),
                        )}
                      >
                        {bft !== null ? `Bft ${bft}` : "—"}
                      </span>
                      <span
                        className={cn(
                          "text-[9px]",
                          active ? "text-primary-foreground/60" : "text-muted-foreground/60",
                        )}
                      >
                        {day.pointCount} pts
                      </span>
                    </div>
                  )
                })()}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Feature drawer (right panel, slides in) ────────────────────────── */}
      <div
        className={cn(
          "border-border/30 bg-card absolute top-0 right-0 bottom-0 z-10 flex flex-col border-l transition-transform duration-200 ease-out",
          drawerOpen ? "translate-x-0" : "translate-x-full",
        )}
        style={{ width: DRAWER_W }}
      >
        {/* Drawer header */}
        <div className="border-border/25 flex shrink-0 items-center justify-between border-b px-3 py-2.5">
          <div>
            <p className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
              {selectedDay ? `Day ${selectedDay.day}` : ""}
            </p>
            <p className="text-sm font-semibold">{selectedDay?.date ?? ""} · Lofoten</p>
          </div>
          <button
            onClick={() => {
              setSelectedDayId(null)
              setSelectedPointId(null)
            }}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Hour slider — always accessible inside drawer */}
        <div className="border-border/20 bg-muted/20 flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
          <SlidersHorizontal className="text-muted-foreground size-3 shrink-0" />
          <input
            type="range"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="accent-primary h-1 flex-1"
            aria-label="Hour"
          />
          <span className="w-8 text-right font-mono text-[10px] font-medium">
            {String(hour).padStart(2, "0")}:00
          </span>
        </div>

        {/* Tab bar */}
        <div className="border-border/20 flex shrink-0 border-b">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[9px] font-bold tracking-wider uppercase transition-colors",
                activeTab === id
                  ? "border-primary text-primary border-b-2"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ── Route ── */}
          {activeTab === "route" && (
            <div className="flex flex-col py-1">
              {points.length === 0 ? (
                <EmptyState icon={Navigation} message="No waypoints added yet" />
              ) : (
                points.map((pt) => (
                  <button
                    key={pt.id}
                    onClick={() => setSelectedPointId(pt.id === selectedPointId ? null : pt.id)}
                    className={cn(
                      "border-border/15 hover:bg-muted/30 flex items-center gap-2.5 border-b px-3 py-2.5 text-left transition-colors last:border-0",
                      pt.id === selectedPointId && "bg-muted/50",
                    )}
                  >
                    <PIcon type={pt.type} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium">{pt.name}</p>
                      {pt.dist !== "start" && (
                        <p className="text-muted-foreground font-mono text-[9px]">{pt.dist}</p>
                      )}
                    </div>
                    <ChevronRight className="text-muted-foreground/40 size-3 shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── Forecast (wind + sea, read-only) ── */}
          {activeTab === "forecast" &&
            (weather || sea ? (
              <div className="px-3 py-2">
                {weather && (
                  <>
                    <p className="text-muted-foreground mt-1 mb-1 text-[9px] font-bold tracking-widest uppercase">
                      Wind &amp; atmosphere
                    </p>
                    <div className="mb-3 flex gap-2">
                      <div className="bg-muted/40 flex flex-1 flex-col items-center gap-1 rounded-lg py-2.5">
                        <Wind className="size-3.5 text-[var(--foam,#5fafcc)]" />
                        <span className="font-mono text-[11px] font-bold">{weather.wind}</span>
                        <span className="text-muted-foreground text-[9px]">{weather.dir}</span>
                      </div>
                      <div className="bg-muted/40 flex flex-1 flex-col items-center gap-1 rounded-lg py-2.5">
                        <Thermometer className="size-3.5 text-[var(--accent,#f97316)]" />
                        <span className="font-mono text-[11px] font-bold">{weather.temp}</span>
                        <span className="text-muted-foreground text-[9px]">air</span>
                      </div>
                      <div className="bg-muted/40 flex flex-1 flex-col items-center gap-1 rounded-lg py-2.5">
                        <Droplets className="text-primary size-3.5" />
                        <span className="font-mono text-[11px] font-bold">{weather.rain}</span>
                        <span className="text-muted-foreground text-[9px]">rain</span>
                      </div>
                    </div>
                    <Row label="Cloud cover" value={weather.cloud} />
                  </>
                )}
                {sea && (
                  <>
                    <p className="text-muted-foreground mt-3 mb-1 text-[9px] font-bold tracking-widest uppercase">
                      Sea state
                    </p>
                    <Row label="Wave" value={`${sea.waveH} · ${sea.waveP} · ${sea.waveDir}`} />
                    <Row label="Swell" value={sea.swellH} />
                    <Row label="Ocean current" value={sea.current} />
                  </>
                )}
              </div>
            ) : (
              <EmptyState icon={Cloud} message="No forecast fetched for this day" />
            ))}

          {/* ── Tides (inputs + calculated gates) ── */}
          {activeTab === "tides" && (
            <div className="flex flex-col">
              {/* Source toggle */}
              <div className="border-border/20 border-b px-3 py-2.5">
                <p className="text-muted-foreground mb-2 text-[9px] font-bold tracking-widest uppercase">
                  Data source
                </p>
                <div className="flex gap-1.5">
                  {(["station", "manual"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setTidalSource(s)}
                      className={cn(
                        "flex-1 rounded-md py-1.5 text-[10px] font-semibold capitalize transition-colors",
                        tidalSource === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/40 text-muted-foreground hover:bg-muted/70",
                      )}
                    >
                      {s === "station" ? "Tide atlas" : "Manual"}
                    </button>
                  ))}
                </div>
                {tidalSource === "station" && (
                  <p className="text-muted-foreground mt-1.5 text-[9px]">
                    Using nearest station — Vestfjorden NW
                  </p>
                )}
              </div>

              {/* Editable parameters */}
              <div className="border-border/20 border-b px-3 py-2.5">
                <p className="text-muted-foreground mb-2 text-[9px] font-bold tracking-widest uppercase">
                  Parameters
                </p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-[10px]">HW time</span>
                    <input
                      type="time"
                      value={hwTime}
                      onChange={(e) => setHwTime(e.target.value)}
                      className="border-border/40 bg-muted/30 focus:border-primary/60 w-20 rounded border px-1.5 py-0.5 font-mono text-[11px] focus:outline-none"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-[10px]">HW height (m)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={hwHeight}
                      onChange={(e) => setHwHeight(e.target.value)}
                      className="border-border/40 bg-muted/30 focus:border-primary/60 w-16 rounded border px-1.5 py-0.5 font-mono text-[11px] focus:outline-none"
                    />
                  </label>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[10px]">Springs / Neaps</span>
                      <span className="font-mono text-[10px] font-medium">
                        {coefficient.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={coefficient}
                      onChange={(e) => setCoefficient(Number(e.target.value))}
                      className="accent-primary h-1 w-full"
                    />
                    <div className="text-muted-foreground/60 flex justify-between text-[9px]">
                      <span>Neaps</span>
                      <span>Springs</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Calculated gate windows */}
              <div className="px-3 py-2.5">
                <p className="text-muted-foreground mb-2 text-[9px] font-bold tracking-widest uppercase">
                  Tidal gates
                </p>
                {tidal ? (
                  <div className="flex flex-col gap-1.5">
                    {tidal.gates.map((gate) => (
                      <div key={gate.name} className="bg-muted/30 rounded-lg px-2.5 py-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-medium">{gate.name}</p>
                          <span className="text-primary font-mono text-[11px] font-bold">
                            {gate.slack}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-0.5 text-[9px]">{gate.note}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground/60 text-[11px]">
                    No tidal gates for this day — add waypoints at tide-sensitive passages.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom sheet (individual point detail) ────────────────────────── */}
      <div
        className={cn(
          "border-border/30 bg-card absolute bottom-0 z-20 rounded-t-xl border-t shadow-2xl transition-all duration-200 ease-out",
          selectedPoint ? "translate-y-0" : "translate-y-full",
        )}
        style={{
          left: STRIP_W,
          right: drawerOpen ? DRAWER_W : 0,
        }}
      >
        {/* drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="bg-border h-1 w-8 rounded-full" />
        </div>

        <div className="flex items-start justify-between px-4 pb-2">
          <div>
            <div className="mb-0.5 flex items-center gap-1.5">
              {selectedPoint && <PIcon type={selectedPoint.type} />}
              <span className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
                {selectedPoint?.type ?? ""}
              </span>
            </div>
            <p className="text-sm font-semibold">{selectedPoint?.name ?? ""}</p>
          </div>
          <button
            onClick={() => setSelectedPointId(null)}
            className="text-muted-foreground hover:bg-muted hover:text-foreground mt-0.5 rounded-md p-1 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          {/* Distance — read-only */}
          <div className="bg-muted/40 rounded-lg px-2.5 py-2">
            <p className="text-muted-foreground mb-0.5 text-[9px] font-bold tracking-wider uppercase">
              Distance
            </p>
            <p className="text-[11px] font-medium">{selectedPoint?.dist ?? "—"}</p>
          </div>

          {/* Notes — opens detail modal */}
          <button
            onClick={() => {
              setImageIdx(0)
              setDetailOpen(true)
            }}
            className="bg-muted/40 hover:bg-muted/70 rounded-lg px-2.5 py-2 text-left transition-colors"
          >
            <p className="text-muted-foreground mb-0.5 text-[9px] font-bold tracking-wider uppercase">
              Notes
            </p>
            <p className="text-muted-foreground/60 text-[11px] italic">Add…</p>
          </button>

          {/* Images — opens detail modal */}
          <button
            onClick={() => {
              setImageIdx(0)
              setDetailOpen(true)
            }}
            className="bg-muted/40 hover:bg-muted/70 rounded-lg px-2.5 py-2 text-left transition-colors"
          >
            <p className="text-muted-foreground mb-0.5 text-[9px] font-bold tracking-wider uppercase">
              Images
            </p>
            <p
              className={cn(
                "text-[11px] font-medium",
                selectedPoint && selectedPoint.imageCount > 0
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {selectedPoint?.imageCount ?? 0}
            </p>
          </button>
        </div>
      </div>

      {/* ── Point detail modal (notes + images, unified) ─────────────────────── */}
      {detailOpen && selectedPoint && (
        <div className="bg-card absolute inset-0 z-[2000] flex flex-col">
          {/* Header */}
          <div className="border-border/30 flex shrink-0 items-start justify-between border-b px-4 py-3">
            <div>
              <div className="mb-0.5 flex items-center gap-1.5">
                <PIcon type={selectedPoint.type} />
                <span className="text-muted-foreground text-[9px] font-bold tracking-widest uppercase">
                  {selectedPoint.type}
                </span>
              </div>
              <p className="text-sm leading-tight font-semibold">{selectedPoint.name}</p>
              <p className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                {fmtCoord(selectedPoint.lat, selectedPoint.lon)}
              </p>
            </div>
            <button
              onClick={() => setDetailOpen(false)}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Image strip */}
          <div
            className="border-border/20 bg-muted/30 relative shrink-0 border-b"
            style={{ height: "42%" }}
          >
            {selectedPoint.imageCount > 0 ? (
              <>
                {/* Placeholder image surface */}
                <div className="flex h-full w-full items-center justify-center">
                  <div className="text-muted-foreground/30 flex flex-col items-center gap-1.5">
                    <ImageIcon className="size-8" />
                    <p className="font-mono text-[10px]">
                      {imageIdx + 1} / {selectedPoint.imageCount}
                    </p>
                  </div>
                </div>

                {/* Prev / Next */}
                {selectedPoint.imageCount > 1 && (
                  <>
                    <button
                      onClick={() =>
                        setImageIdx(
                          (i) => (i - 1 + selectedPoint.imageCount) % selectedPoint.imageCount,
                        )
                      }
                      className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/20 p-1.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-white"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <button
                      onClick={() => setImageIdx((i) => (i + 1) % selectedPoint.imageCount)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/20 p-1.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-black/40 hover:text-white"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </>
                )}

                {/* Dot indicators */}
                {selectedPoint.imageCount > 1 && (
                  <div className="absolute bottom-2 flex w-full justify-center gap-1.5">
                    {Array.from({ length: selectedPoint.imageCount }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImageIdx(i)}
                        className={cn(
                          "size-1.5 rounded-full transition-colors",
                          i === imageIdx ? "bg-foreground" : "bg-foreground/20",
                        )}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* No images — dimmed empty state */
              <div className="text-muted-foreground/30 flex h-full flex-col items-center justify-center gap-2">
                <ImageIcon className="size-7" />
                <p className="text-[10px]">No photos yet</p>
              </div>
            )}
          </div>

          {/* Notes editor */}
          <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
            <p className="text-muted-foreground mb-2 text-[9px] font-bold tracking-widest uppercase">
              Notes
            </p>
            <textarea
              placeholder="Landing notes, hazards, tidal timing, anything worth remembering…"
              className="border-border/30 bg-muted/20 placeholder:text-muted-foreground/40 focus:border-primary/50 min-h-0 flex-1 resize-none rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* ── Hint when nothing selected ─────────────────────────────────────── */}
      {!selectedDayId && (
        <div
          className="absolute top-1/2 -translate-y-1/2 text-center"
          style={{ left: STRIP_W + 24, right: 24 }}
        >
          <div className="border-border/20 bg-card/80 inline-block rounded-xl border px-5 py-3.5 shadow-lg backdrop-blur-sm">
            <Clock className="text-muted-foreground/50 mx-auto mb-1.5 size-4" />
            <p className="text-muted-foreground text-[11px]">
              Select a day from the strip to open the feature drawer
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
