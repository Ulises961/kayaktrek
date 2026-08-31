#!/usr/bin/env node --experimental-strip-types
// Generates theme.generated.css from the frontend workspace's design tokens.
//
// Why this exists instead of Tailwind's own `@config "./tailwind.config.js"` directive:
// Expo's built-in web-CSS transform (which react-native-css's Metro transformer runs
// *first*, even for native platforms — see node_modules/react-native-css/src/metro/
// metro-transformer.ts) processes global.css through lightningcss directly and does not
// resolve `@config`, so a JS/TS-config-based theme extension fails to bundle at all
// ("Unknown at rule: @config" -> a hard parse error). Generating a plain CSS `@theme`
// block sidesteps that pipeline gap entirely while keeping tokens.ts as the one source
// of truth — this script reads it, nothing here re-types a color value by hand.
//
// Run manually after editing tokens.ts (`node scripts/generate-theme-css.js`), or via
// `npm run generate:theme`. Not wired into every `start`/`test` invocation because the
// generated file is committed (see theme.generated.css's own header) — regenerate only
// when tokens.ts actually changes.
const fs = require("node:fs")
const path = require("node:path")

const tokensPath = path.resolve(__dirname, "..", "..", "frontend", "lib", "tokens.ts")
const outPath = path.resolve(__dirname, "..", "theme.generated.css")

const { palette, lightTokens, darkTokens } = require(tokensPath)

function colorScale(prefix, entries) {
  return Object.entries(entries)
    .map(([shade, value]) => `  --color-${prefix}-${shade}: ${value};`)
    .join("\n")
}

function semanticVars(prefix, tokensObj) {
  const kebab = (s) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())
  return Object.entries(tokensObj)
    .map(([key, value]) => `  --color-${prefix}${prefix ? "-" : ""}${kebab(key)}: ${value};`)
    .join("\n")
}

const css = `/* GENERATED FILE — do not hand-edit.
 * Produced by scripts/generate-theme-css.js from ../frontend/lib/tokens.ts's
 * \`palette\`/\`lightTokens\`/\`darkTokens\` exports. Regenerate after changing tokens.ts.
 */
@theme {
${colorScale("ocean", {
  50: palette.ocean50,
  100: palette.ocean100,
  200: palette.ocean200,
  300: palette.ocean300,
  400: palette.ocean400,
  500: palette.ocean500,
  600: palette.ocean600,
  700: palette.ocean700,
  800: palette.ocean800,
  900: palette.ocean900,
  950: palette.ocean950,
})}
${colorScale("foam", {
  100: palette.foam100,
  200: palette.foam200,
  300: palette.foam300,
  400: palette.foam400,
})}
${colorScale("sunset", {
  100: palette.sunset100,
  300: palette.sunset300,
  400: palette.sunset400,
  500: palette.sunset500,
  600: palette.sunset600,
})}
${colorScale("slate", {
  50: palette.slate50,
  100: palette.slate100,
  200: palette.slate200,
  300: palette.slate300,
  400: palette.slate400,
  500: palette.slate500,
  600: palette.slate600,
  700: palette.slate700,
  800: palette.slate800,
  900: palette.slate900,
  950: palette.slate950,
})}
${semanticVars("", lightTokens)}
${semanticVars("dark", darkTokens)}
}
`

fs.writeFileSync(outPath, css)
console.log(`Wrote ${path.relative(process.cwd(), outPath)}`)
