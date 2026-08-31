// Flat config (ESLint 9+), mirroring eslint-config-expo's own recommended setup.
const expoConfig = require("eslint-config-expo/flat")
const { defineConfig, globalIgnores } = require("eslint/config")

module.exports = defineConfig([
  expoConfig,
  {
    // Plain Node build/codegen scripts (see scripts/generate-theme-css.js) — CommonJS,
    // run outside the RN/Metro runtime, so they get Node globals instead of the
    // RN/browser globals eslint-config-expo assumes everywhere else.
    files: ["scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
  },
  globalIgnores(["node_modules/**", ".expo/**", "dist/**", "nativewind-env.d.ts"]),
])
