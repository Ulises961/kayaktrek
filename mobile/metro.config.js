const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { withNativewind } = require("nativewind/metro");

const projectRoot = __dirname;
// The sibling `frontend/` workspace — mobile reuses its design tokens (lib/tokens.ts)
// and Zod DTO schemas (lib/dtos/*) directly rather than duplicating them. There is no
// root pnpm-workspace.yaml; `mobile/` is a sibling directory like `frontend/`/`backend/`,
// so Metro is told about the sibling explicitly instead of relying on workspace tooling.
// See the M9 plan item 11 / the M9a plan WP5.
const frontendRoot = path.resolve(projectRoot, "..", "frontend");

const config = getDefaultConfig(projectRoot);

// Metro only watches the project root by default — add the sibling `frontend/` directory
// so its files are visible to the bundler at all.
config.watchFolders = [...(config.watchFolders ?? []), frontendRoot];

// A `watchFolders` entry alone isn't enough: with multiple roots configured, Metro's
// hierarchical node_modules walk doesn't reach up from a file's own real directory the way
// plain Node resolution would — an import from `frontend/lib/...` fails to resolve ANY
// node_modules dependency it pulls in unless that dependency's node_modules directory is
// listed here explicitly. Both `mobile/node_modules` (for deps frontend/lib and mobile both
// need, e.g. `zod`, pinned to the same version in both — see fix/mobile-zod-version-drift)
// and `frontend/node_modules` itself (for a dependency only frontend/lib uses, e.g.
// `date-fns` in frontend/lib/trips/format.ts, which broke bundling before this line existed)
// need to be here — duplicating every such package into mobile's own package.json instead
// is the same bug shape recurring for a new package every time frontend/lib picks up a new
// dependency.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, "node_modules"),
  path.resolve(frontendRoot, "node_modules"),
];

const finalConfig = withNativewind(config);

// withNativewind (react-native-css's withReactNativeCSS) sets transformerPath with
// no exclude option — override it with a thin wrapper that carves out @expo/log-box's
// CSS Modules files. See metro-css-transformer.js for why.
finalConfig.transformerPath = require.resolve("./metro-css-transformer.js");

module.exports = finalConfig;
