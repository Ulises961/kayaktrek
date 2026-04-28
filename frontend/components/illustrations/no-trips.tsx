export function NoTripsIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Water waves */}
      <path
        d="M0 110 Q30 100 60 110 Q90 120 120 110 Q150 100 180 110 Q210 120 240 110 L240 160 L0 160Z"
        className="fill-secondary dark:fill-secondary/40"
      />
      <path
        d="M0 120 Q40 108 80 120 Q120 132 160 120 Q200 108 240 120 L240 160 L0 160Z"
        className="fill-primary/15 dark:fill-primary/20"
      />

      {/* Kayak hull */}
      <ellipse
        cx="120"
        cy="108"
        rx="64"
        ry="9"
        className="fill-primary dark:fill-primary"
      />

      {/* Cockpit rim */}
      <ellipse
        cx="120"
        cy="106"
        rx="18"
        ry="5"
        className="fill-secondary dark:fill-secondary"
      />

      {/* Paddle shaft */}
      <line
        x1="60"
        y1="88"
        x2="180"
        y2="88"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-foreground/50 dark:stroke-foreground/40"
      />

      {/* Paddle blades */}
      <ellipse
        cx="55"
        cy="84"
        rx="14"
        ry="6"
        transform="rotate(-15 55 84)"
        className="fill-accent dark:fill-accent"
      />
      <ellipse
        cx="185"
        cy="92"
        rx="14"
        ry="6"
        transform="rotate(-15 185 92)"
        className="fill-accent dark:fill-accent"
      />

      {/* Horizon line */}
      <line
        x1="20"
        y1="72"
        x2="220"
        y2="72"
        strokeWidth="1"
        strokeDasharray="4 6"
        className="stroke-border dark:stroke-border"
      />

      {/* Sun */}
      <circle
        cx="190"
        cy="50"
        r="16"
        className="fill-accent/30 dark:fill-accent/20"
      />
      <circle
        cx="190"
        cy="50"
        r="10"
        className="fill-accent dark:fill-accent"
      />
    </svg>
  )
}
