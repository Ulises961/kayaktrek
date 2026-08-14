export function IslandIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 480 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* ── Background ── */}
      <rect width="480" height="400" fill="var(--background)" />

      {/* ── Sun (top-right) ── */}
      <circle cx="380" cy="90" r="44" fill="var(--illus-accent)" opacity="0.18" />
      <circle cx="380" cy="90" r="26" fill="var(--illus-accent)" opacity="0.5" />

      {/* ── Horizon ── */}
      <line
        x1="0"
        y1="180"
        x2="480"
        y2="180"
        stroke="var(--border)"
        strokeWidth="2"
        strokeDasharray="8 10"
      />

      {/* ── Water ── */}
      <rect x="0" y="180" width="480" height="220" fill="var(--secondary)" opacity="0.45" />

      {/* ── Waves ── */}
      <path
        d="M0 210 Q120 195 240 210 T480 210"
        stroke="var(--foam)"
        strokeWidth="2"
        fill="none"
        opacity="0.5"
      />

      {/* ── Island (now intersecting horizon) ── */}
      <path
        d="
      M140 185
      Q240 150 340 185
      Q360 200 350 215
      Q240 225 130 215
      Q120 200 140 185
      Z
    "
        fill="var(--illus-accent)"
        opacity="0.35"
      />

      {/* subtle ridge highlight */}
      <path
        d="M150 190 Q240 160 330 190"
        stroke="var(--foam)"
        strokeWidth="1.5"
        opacity="0.4"
        fill="none"
      />
    </svg>
  )
}
