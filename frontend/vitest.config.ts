import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    // Headroom for heavier RTL flows (Radix Dialog + React transitions) when the
    // full suite runs all workers in parallel under CPU contention — the pre-push
    // hook locally and, especially, 2-core GitHub runners, where an otherwise-fast
    // test can blow past the default 5s. Generous on purpose: a real hang still
    // fails, just later, while genuine work no longer flakes.
    testTimeout: 30000,
    hookTimeout: 30000,
    // vmThreads reuses one jsdom VM context per worker instead of spinning up a
    // fresh jsdom instance per test file (the default `forks`/`threads` pools
    // both do the latter). Measured on the M15 sweep (2026-08): 208 files, full
    // suite went from ~132s to ~43s (env-setup time alone: 163s -> 4s), with no
    // change in pass/fail under `--sequence.shuffle` — module-level isolation
    // between files is unaffected, only the environment is shared. Per-file
    // `isolate` stays at its default (true); don't disable it to chase more
    // speed without re-verifying under shuffle first.
    //
    // CI-only exception: on GitHub Actions' shared ubuntu-latest runners, vmThreads'
    // per-file V8-isolate-creation overhead measured catastrophically worse instead
    // of better — individual RTL component tests that finish in milliseconds
    // locally took 14-40 *real* seconds each in CI, tripping the 30s testTimeout
    // wholesale and inflating a run that finishes in under a minute here into one
    // that ran for 1h39m before being cancelled twice on the same commit
    // (frontend-ci.yml run 226, attempts 2 and 3). `forks` (vitest's default) does
    // not exhibit this; CI falls back to it, keeping vmThreads for the local/dev
    // environment where it was actually measured to help.
    pool: process.env.CI ? "forks" : "vmThreads",
    // Medical notes was parked (2026-09-02) behind NEXT_PUBLIC_MEDICAL_NOTES, off by
    // default everywhere that has not opted in. Forced on for the suite so parking the
    // feature does not quietly stop testing it — the same reason TestingConfig forces the
    // backend's MEDICAL_NOTES_ENABLED on. The flag-off path has its own file
    // (lib/__tests__/features-parked.test.tsx), which mocks lib/features rather than
    // relying on this.
    env: { NEXT_PUBLIC_MEDICAL_NOTES: "true" },
    // Only measured under `pnpm test:coverage`, which CI runs and uploads to Codecov. The
    // denominator is the code the app ships: shadcn primitives (`components/ui`, never edited
    // by hand) and the dev-only design showcase are left out, so the number says how much of
    // what we wrote is exercised rather than how much of a vendored library is.
    coverage: {
      provider: "v8",
      reporter: ["lcov", "text-summary"],
      include: [
        "app/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/__tests__/**",
        "**/__mocks__/**",
        "**/*.d.ts",
        "components/ui/**",
        "app/**/design/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "./__mocks__/server-only.ts"),
    },
  },
})
