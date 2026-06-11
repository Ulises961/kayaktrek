import React from "react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="chart-grid flex min-h-screen flex-col items-center justify-center px-4 py-12">
      {/* Compass rose — top-left chart identity mark */}
      <div className="pointer-events-none fixed top-6 left-6 flex items-center gap-2.5 select-none">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="8" stroke="oklch(0.64 0.125 225 / 0.5)" strokeWidth="1" />
          <circle cx="10" cy="10" r="2" fill="oklch(0.64 0.125 225 / 0.5)" />
          <line
            x1="10"
            y1="1"
            x2="10"
            y2="4.5"
            stroke="oklch(0.64 0.125 225 / 0.5)"
            strokeWidth="1.2"
          />
          <line
            x1="10"
            y1="15.5"
            x2="10"
            y2="19"
            stroke="oklch(0.64 0.125 225 / 0.5)"
            strokeWidth="1.2"
          />
          <line
            x1="1"
            y1="10"
            x2="4.5"
            y2="10"
            stroke="oklch(0.64 0.125 225 / 0.5)"
            strokeWidth="1.2"
          />
          <line
            x1="15.5"
            y1="10"
            x2="19"
            y2="10"
            stroke="oklch(0.64 0.125 225 / 0.5)"
            strokeWidth="1.2"
          />
        </svg>
        <span
          className="text-[11px] tracking-[0.22em] uppercase opacity-50"
          style={{ fontFamily: "var(--font-display)", color: "oklch(0.73 0.06 225)" }}
        >
          Kayak Expedition Planner
        </span>
      </div>

      {/* Chart corner labels */}
      <span
        className="pointer-events-none fixed bottom-4 left-5 font-mono text-[10px] opacity-25 select-none"
        style={{ color: "oklch(0.73 0.06 225)" }}
      >
        49°N 002°W
      </span>
      <span
        className="pointer-events-none fixed right-5 bottom-4 font-mono text-[10px] opacity-25 select-none"
        style={{ color: "oklch(0.73 0.06 225)" }}
      >
        Chart No. KP-01
      </span>

      {/* Auth card */}
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
