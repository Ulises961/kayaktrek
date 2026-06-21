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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "./__mocks__/server-only.ts"),
    },
  },
})
