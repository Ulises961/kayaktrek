const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { withNativewind } = require("nativewind/metro");

const projectRoot = __dirname;
// The sibling `frontend/` workspace — mobile reuses its design tokens (lib/tokens.ts)
// and Zod DTO schemas (lib/dtos/*) directly rather than duplicating them. There is no
// root pnpm-workspace.yaml; `mobile/` is a sibling directory like `frontend/`/`backend/`,
// so Metro is told about the sibling explicitly instead of relying on workspace tooling.
// See plans/M9.md item 11 / plans/M9a.md WP5.
const frontendRoot = path.resolve(projectRoot, "..", "frontend");

const config = getDefaultConfig(projectRoot);

// Metro only watches the project root by default — add the sibling `frontend/` directory
// so its files are visible to the bundler at all.
config.watchFolders = [...(config.watchFolders ?? []), frontendRoot];

// A `watchFolders` entry alone isn't enough: Metro still resolves modules by walking up
// from the requesting file's own `node_modules`, so an import from `frontend/lib/...` would
// otherwise fail to resolve any node_modules dependency it pulls in (e.g. `zod`, used by
// every DTO). Let it also check `mobile/node_modules`.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, "node_modules"),
];

const finalConfig = withNativewind(config);

// withNativewind (react-native-css's withReactNativeCSS) sets transformerPath with
// no exclude option — override it with a thin wrapper that carves out @expo/log-box's
// CSS Modules files. See metro-css-transformer.js for why.
finalConfig.transformerPath = require.resolve("./metro-css-transformer.js");

module.exports = finalConfig;
