const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

/* Exclude transient / tool-managed directories that may disappear at runtime.
   Metro crashes with ENOENT if it tries to watch a directory that no longer exists. */
const escapeRegex = (str) => str.replace(/[/\-\\^$*+?.()|[\]{}]/g, "\\$&");
const blockPaths = [
  path.resolve(monorepoRoot, ".local"),
  path.resolve(monorepoRoot, ".git"),
];
const blockListRegex = new RegExp(
  blockPaths.map((p) => `^${escapeRegex(p)}(\\/|\\\\|$)`).join("|")
);

const existingBlockList = config.resolver.blockList;
if (existingBlockList instanceof RegExp) {
  config.resolver.blockList = new RegExp(
    `${existingBlockList.source}|${blockListRegex.source}`
  );
} else {
  config.resolver.blockList = blockListRegex;
}

module.exports = config;
