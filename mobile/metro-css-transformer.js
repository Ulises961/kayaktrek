// Wraps react-native-css's Metro transformer to exclude @expo/log-box's own CSS
// Modules files, which its lightningcss-based compiler cannot parse — a known,
// still-open upstream bug (nativewind/react-native-css#293): the transformer
// tests every *.css/*.scss/*.sass path with a bare regex
// (`/\.(s?css|sass)$/`, react-native-css/dist/commonjs/metro/metro-transformer.js)
// with no exclusion hook, so Expo's own dev-only error-overlay CSS (bundled
// transitively via expo-router's entry graph in dev builds) gets run through
// react-native-css's compiler too and crashes with
// "failed to deserialize; expected an object-like struct named Specifier, found ()".
// Route just those files through Metro's plain default transformer instead —
// exactly what react-native-css's own transformer already does for `web`/non-CSS
// files, just scoped to this one path.
// react-native-css's package.json "exports" only allows the "./metro" subpath (the
// withReactNativeCSS entry point) — the transformer module itself isn't a public
// export, so it can't be required by specifier. Resolve the allowed subpath, then
// reach its sibling file (both live in dist/commonjs/metro/) via filesystem path,
// which Node's exports restriction does not gate.
const path = require("node:path");
const rncssMetroDir = path.dirname(require.resolve("react-native-css/metro"));
const rncssTransformer = require(path.join(rncssMetroDir, "metro-transformer.js"));

const EXCLUDED = /node_modules[\\/]@expo[\\/]log-box[\\/].*\.css$/;

exports.transform = async function transform(config, projectRoot, filePath, data, options) {
  if (EXCLUDED.test(filePath)) {
    const worker = require(require("@expo/metro-config").unstable_transformerPath);
    return worker.transform(config, projectRoot, filePath, data, options);
  }
  return rncssTransformer.transform(config, projectRoot, filePath, data, options);
};
