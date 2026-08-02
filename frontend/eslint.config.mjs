import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The e2e live stack builds into its own distDir (NEXT_DIST_DIR=.next-e2e,
    // e2e/run-live-stack.sh) so it doesn't clobber a running dev server's .next.
    // Listing globalIgnores replaces the config's defaults rather than adding to
    // them, so a second build directory has to be named here too — without this,
    // one e2e run leaves generated output behind and `pnpm lint` fails on it.
    ".next-e2e/**",
  ]),
  {
    rules: {
      // Allow _-prefixed identifiers as intentional "unused" placeholders
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
])

export default eslintConfig
