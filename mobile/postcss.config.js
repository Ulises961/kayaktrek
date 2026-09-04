// Without this, Expo's web-CSS pipeline (which react-native-css's Metro transformer
// piggybacks on for the "compile the utility classes" step, even for native platforms —
// see metro-css-transformer.js) never invokes Tailwind's actual engine. It runs plain
// lightningcss on the raw text instead, which doesn't understand any Tailwind v4 at-rule
// (@import "tailwindcss", @theme, @source, @utility from plugins like tailwindcss-safe-area)
// and silently produces an empty stylesheet rather than erroring — which is why every
// className rendered with zero styling applied. Mirrors frontend/postcss.config.mjs.
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
